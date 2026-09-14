import "server-only"

import { vocabularyForSystem } from "@lospor/core/code-systems"
import { icd10Rows } from "@lospor/core/vocabulary"

/**
 * Imported diagnoses, resolved against LOSPOR's ICD-10 vocabulary.
 *
 * A hospital sends its own wording and, usually, an ICD-10 code. Where the code
 * is one LOSPOR holds (the bundled vocabulary, including the Bulgarian NHIS
 * six-character codes), the proposal becomes the same tag the diagnosis picker
 * makes: LOSPOR's label in the site's language, both labels, the canonical
 * code, and system "ICD-10". The hospital's wording stays beside it as
 * `sourceLabel`, so the clinician checks the proposal against what arrived.
 *
 * Only an exact code is resolved. A code LOSPOR does not hold, a code in
 * another vocabulary (SNOMED, a local list), or a free-text entry is imported
 * exactly as sent: a truncated or guessed code would put a diagnosis the
 * hospital never made into the record.
 */

type DiagnosisTag = {
  label?: unknown
  code?: unknown
  system?: unknown
  [key: string]: unknown
}

/**
 * ICD-10 by any name a hospital uses: the FHIR and OID names core knows, or a
 * system naming the NHIS ICD-10 list (CL011, МКБ-10), for which NHIS publishes
 * no URI of its own.
 */
function isIcd10System(system: unknown): boolean {
  const text = typeof system === "string" ? system : ""
  return vocabularyForSystem(text, "ICD10") === "ICD10"
    || /(?:^|[^\p{L}\p{N}])(?:cl011|mkb-?10|мкб-?10)(?:$|[^\p{L}\p{N}])/iu.test(text)
}

let byCode: Map<string, { code: string; labelEn: string; labelBg?: string }> | null = null

function vocabulary() {
  if (!byCode) {
    byCode = new Map(icd10Rows()
      .filter(row => !row.code.includes("-"))
      .map(row => [row.code, { code: row.code, labelEn: row.labelEn, labelBg: row.labelBg || undefined }]))
  }
  return byCode
}

/** "k802", "K80.2 " and "K80.2" are one code; ranges and other shapes are not codes. */
export function canonicalIcd10Code(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "")
  const match = compact.match(/^([A-Z]\d{2})\.?([0-9A-Z]{0,4})$/)
  if (!match) return null
  return match[2] ? `${match[1]}.${match[2]}` : match[1]
}

export function resolveImportedDiagnoses<T extends DiagnosisTag>(
  tags: T[],
  locale: "bg" | "en",
): (T & { labelEn?: string; labelBg?: string; sourceLabel?: string })[] {
  return tags.map(tag => {
    // Absent means ICD-10, as it does for everything LOSPOR stores; anything
    // naming another vocabulary is left alone.
    if (typeof tag.code !== "string" || !tag.code.trim() || !isIcd10System(tag.system)) return tag
    const canonical = canonicalIcd10Code(tag.code)
    const row = canonical ? vocabulary().get(canonical) : undefined
    if (!row) return tag
    const label = locale === "bg" ? row.labelBg ?? row.labelEn : row.labelEn
    const wording = typeof tag.label === "string" ? tag.label.trim() : ""
    return {
      ...tag,
      label,
      code: row.code,
      system: "ICD-10",
      labelEn: row.labelEn,
      ...(row.labelBg ? { labelBg: row.labelBg } : {}),
      ...(wording && wording.toLocaleLowerCase("bg") !== label.toLocaleLowerCase("bg") ? { sourceLabel: wording } : {}),
    }
  })
}

/** The site's language, as the rest of the appliance reads it. */
export function siteLocale(): "bg" | "en" {
  return process.env.LOSPOR_DEFAULT_LOCALE?.trim() === "en" ? "en" : "bg"
}
