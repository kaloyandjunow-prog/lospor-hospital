import { LAB_NAME_ALIASES } from "./ehr-lab-aliases"
import { LAB_LIBRARY } from "./labs"

/**
 * Working out which of our lab tests a hospital's result is.
 *
 * A FHIR `Observation.code` is a CodeableConcept, so the same haemoglobin can
 * arrive as LOINC 718-7, as a local `HGB`, as `ХГБ`, or as several of those at
 * once — and which of them a given hospital sends is not discoverable from any
 * specification. It is a property of their laboratory system.
 *
 * Four sources, in order:
 *
 *   1. A site's own mapping, because a local code is only meaningful locally
 *      and the site is the only one who can say what `ХГБ` means.
 *   2. LOINC, which is the same everywhere and which we can therefore ship.
 *   3. Our own test name, when they called it exactly what we call it. That is
 *      the ordinary case for a dropped file, which names its tests instead of
 *      coding them, and it is a real answer rather than a fallback.
 *   4. Nothing — and then the result is still imported, carrying whatever the
 *      hospital called it.
 *
 * A folder-drop result has no code to key any of this on, so its name becomes
 * one under a reserved system. That is what lets one mapping table, one screen
 * and one resolver serve both transports rather than two of each.
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
  // Both creatinines, because the two differ by unit rather than by analyte and
  // a hospital sends whichever its laboratory reports in. 2160-0 is mass per
  // volume (mg/dL); 14682-9 is moles per volume (µmol/L), which is what this
  // register stores and therefore also what it exports. Recognising only the
  // mass form meant an SI creatinine -- the ordinary one here -- arrived
  // unrecognised, and so did a result LOSPOR itself had produced.
  "2160-0": "Creatinine",
  "14682-9": "Creatinine",
  // Both scales for each of these, and for the same reason as the creatinines:
  // a laboratory reports in mass or in moles, and the value is converted on the
  // way in either way. The molar code is the one this register exports under,
  // because that is the unit it stores.
  "3094-0": "Urea (BUN)",
  "22664-7": "Urea (BUN)",
  "2345-7": "Glucose",
  "14749-6": "Glucose",
  "15074-8": "Glucose",
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

/**
 * The system a folder-drop result is keyed under when it carries no code.
 *
 * A dropped file names its tests rather than coding them, so there is nothing
 * to key a site mapping on except the name itself. Giving those names a
 * reserved system lets them share one table, one screen and one resolver with
 * the coded results a FHIR site sends, instead of growing a second mapping
 * surface that has to be configured separately and drifts from the first.
 */
export const FOLDER_NAME_SYSTEM = "urn:lospor:folder-name"

/** Our own test names, keyed the same way a hospital label is. */
const LIBRARY_TEST_BY_KEY = new Map<string, string>([
  // Our own names first, then the labels hospitals use for them. An alias
  // never overrides a real test name.
  ...Object.entries(LAB_NAME_ALIASES).map(([alias, test]) => [folderLabKey(alias), test] as const),
  ...LAB_LIBRARY.map(test => [folderLabKey(test.name), test.name] as const),
])

/**
 * A hospital's label, reduced to something usable as a key.
 *
 * Codes are disciplined; labels typed or exported by a laboratory system are
 * not. Without this, `ХГБ`, `ХГБ ` and the same Cyrillic in a different Unicode
 * normalisation are three rows an operator has to answer three times, and the
 * counts that are supposed to say what matters get split between them.
 *
 * Case is folded because a label's capitalisation is not a distinction any
 * laboratory means; the operator still sees the label as it arrived.
 */
export function folderLabKey(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en")
}

/** The coding a named, uncoded result is resolved and recorded under. */
export function folderLabCoding(name: string): EhrCoding {
  return { system: FOLDER_NAME_SYSTEM, code: folderLabKey(name), display: name }
}

export type ResolvedLabTest = {
  /** What we will call it. Never empty. */
  test: string
  /** How we arrived at that. */
  via: "site" | "loinc" | "name" | "display" | "code"
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

  // They called it exactly what we call it.
  //
  // This matters most for folder drop, whose files are written to our field
  // names, but it is not folder-specific: a FHIR display of "Haemoglobin (Hb)"
  // is the same statement. Without it every correctly written folder file would
  // land on the operator's mapping screen as a question about a name that needs
  // no answer, and an empty screen would stop meaning "finished".
  for (const candidate of [options.text, ...list.map(coding => coding.display)]) {
    const named = candidate == null ? null : LIBRARY_TEST_BY_KEY.get(folderLabKey(String(candidate)))
    if (named) return { test: named, via: "name", unmapped: false }
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
