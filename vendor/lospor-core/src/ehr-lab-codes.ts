/**
 * Working out which of our lab tests a hospital's result is.
 *
 * A FHIR `Observation.code` is a CodeableConcept, so the same haemoglobin can
 * arrive as LOINC 718-7, as a local `HGB`, as `ХГБ`, or as several of those at
 * once — and which of them a given hospital sends is not discoverable from any
 * specification. It is a property of their laboratory system.
 *
 * Three sources, in order:
 *
 *   1. A site's own mapping, because a local code is only meaningful locally
 *      and the site is the only one who can say what `ХГБ` means.
 *   2. LOINC, which is the same everywhere and which we can therefore ship.
 *   3. Nothing — and then the result is still imported, carrying whatever the
 *      hospital called it.
 *
 * That third case is the one worth being deliberate about. Dropping a result we
 * cannot name loses clinical data silently, and silently is the part that
 * matters: nobody reviews an absence. A clinician reading "ХГБ 89 g/L" in the
 * review screen understands it perfectly well, so the honest behaviour is to
 * show it, mark it unmapped, and let the site map it properly afterwards.
 */

export const LOINC_SYSTEM = "http://loinc.org"

/**
 * LOINC codes for the tests this product knows about.
 *
 * Deliberately partial. Every entry here is one a site never has to configure,
 * and a wrong entry is worse than a missing one — a mislabelled potassium is a
 * clinical error, while an unmapped one is a clinician reading the hospital's
 * own name for it. Codes only where they are unambiguous.
 */
export const LOINC_TO_LAB_TEST: Readonly<Record<string, string>> = Object.freeze({
  "718-7": "Haemoglobin (Hb)",
  "4544-3": "Haematocrit (Hct)",
  "789-8": "Erythrocytes (RBC)",
  "6690-2": "Leucocytes (WBC)",
  "777-3": "Platelets",
  "787-2": "MCV",
  "785-6": "MCH",
  "786-4": "MCHC",
  "2951-2": "Sodium (Na⁺)",
  "2823-3": "Potassium (K⁺)",
  "2075-0": "Chloride (Cl⁻)",
  "2160-0": "Creatinine",
  "3094-0": "Urea (BUN)",
  "2345-7": "Glucose",
  "1742-6": "ALT (SGPT)",
  "1920-8": "AST (SGOT)",
  "2885-2": "Total protein",
  "1751-7": "Albumin",
  "5902-2": "PT (Prothrombin time)",
  "6301-6": "INR",
  "3173-2": "aPTT",
  "3255-7": "Fibrinogen",
  "1988-5": "CRP",

  // Arterial blood gas. Every one of these specifies arterial blood in the
  // concept name, which is what makes them safe to ship: a venous pCO₂ has a
  // different code and would be a different reading of the same patient.
  //
  // These are here because a blood gas arrives as one Observation whose
  // components carry the codes, and without them an ABG resolved to bare
  // numbers like "2744-1" — every panel landing as four unrecognised tests that
  // a site would have to map by hand, at every site.
  "2744-1": "pH",
  "2019-8": "PaCO₂",
  "2703-7": "PaO₂",
  "1960-4": "HCO₃⁻ (ABG)",
  "1925-7": "Base excess (BE)",
  "2708-6": "SaO₂",
  "2518-9": "Lactate (ABG)",
})

export type EhrCoding = {
  system?: string | null
  code?: string | null
  display?: string | null
}

/** A site's own mapping, keyed the way FHIR identifies a code. */
export type SiteLabCodeMap = Readonly<Record<string, string>>

/** `system|code`, which is how FHIR writes a coded value in a search too. */
export function labCodeKey(system: string | null | undefined, code: string | null | undefined): string {
  return `${(system ?? "").trim()}|${(code ?? "").trim()}`
}

export type ResolvedLabTest = {
  /** What we will call it. Never empty. */
  test: string
  /** How we arrived at that. */
  via: "site" | "loinc" | "display" | "code"
  /** True when nobody has told us what this is, so a site can be asked. */
  unmapped: boolean
  /** The coding we could not place, for the "map these" list. */
  unresolved?: { system: string; code: string; display: string }
}

/**
 * Name one observation.
 *
 * The site map wins over LOINC, and deliberately: a hospital that has mapped
 * its own code has said something specific about its own laboratory, and a
 * shipped default should never override that.
 */
export function resolveLabTest(
  codings: EhrCoding[] | undefined,
  options: { siteMap?: SiteLabCodeMap; text?: string | null } = {},
): ResolvedLabTest {
  const list = (codings ?? []).filter(coding => coding && (coding.code || coding.display))
  const siteMap = options.siteMap ?? {}

  for (const coding of list) {
    const mapped = siteMap[labCodeKey(coding.system, coding.code)]
    if (mapped) return { test: mapped, via: "site", unmapped: false }
  }

  for (const coding of list) {
    if ((coding.system ?? "") !== LOINC_SYSTEM) continue
    const mapped = LOINC_TO_LAB_TEST[String(coding.code ?? "").trim()]
    if (mapped) return { test: mapped, via: "loinc", unmapped: false }
  }

  // Nothing recognised it. Import it under the hospital's own name rather than
  // dropping it — a clinician reading "ХГБ 89 g/L" knows exactly what that is,
  // and an absent result is reviewed by nobody.
  const first = list[0]
  const display = (options.text ?? first?.display ?? "").trim()
  const code = String(first?.code ?? "").trim()
  const label = display || code

  return {
    test: label || "Unnamed result",
    via: display ? "display" : "code",
    unmapped: true,
    ...(first
      ? {
          unresolved: {
            system: (first.system ?? "").trim(),
            code,
            display,
          },
        }
      : {}),
  }
}

/**
 * The codes a site still has to map, counted.
 *
 * The point of collecting these is that a site cannot configure a mapping for a
 * code it has never seen. Pulling real results and reporting what came back
 * unrecognised turns configuration from a specification exercise into reading a
 * list — and the count says which ones are worth the effort.
 */
export function unmappedLabCodes(
  resolved: ResolvedLabTest[],
): { system: string; code: string; display: string; count: number }[] {
  const seen = new Map<string, { system: string; code: string; display: string; count: number }>()
  for (const item of resolved) {
    if (!item.unmapped || !item.unresolved) continue
    const key = labCodeKey(item.unresolved.system, item.unresolved.code)
    const existing = seen.get(key)
    if (existing) existing.count += 1
    else seen.set(key, { ...item.unresolved, count: 1 })
  }
  return [...seen.values()].sort((a, b) => b.count - a.count)
}
