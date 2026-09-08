/**
 * Which vocabulary a hospital's code came from.
 *
 * A coded diagnosis carries the code and the system that defines it, and the
 * system is the half that decides what the code means. `250` is diabetes in
 * ICD-9 and nothing in ICD-10; `I10` is essential hypertension in ICD-10 and
 * not a SNOMED identifier at all. Looking a code up in the wrong vocabulary is
 * usually a miss, which is safe, and occasionally a hit, which is a confidently
 * wrong diagnosis on a patient's record.
 *
 * FHIR names systems by URI, so the same ICD-10 arrives as
 * `http://hl7.org/fhir/sid/icd-10`, as `ICD10`, or as `icd-10` depending on who
 * built the interface. All of them mean the same thing and none of them is what
 * our concept map is keyed on.
 */

/** The vocabularies the concept map is keyed by. */
const KNOWN: Readonly<Record<string, string>> = Object.freeze({
  // ICD-10 and its national modifications. The modifications extend the base
  // classification rather than replacing it, and the codes we hold are the
  // base ones, so a modification's code either matches or misses -- which is
  // the right behaviour for a code we do not have.
  "icd10": "ICD10",
  "icd-10": "ICD10",
  "icd10cm": "ICD10",
  "icd-10-cm": "ICD10",
  "icd10gm": "ICD10",
  "http://hl7.org/fhir/sid/icd-10": "ICD10",
  "http://hl7.org/fhir/sid/icd-10-cm": "ICD10",
  "urn:oid:2.16.840.1.113883.6.3": "ICD10",

  "snomed": "SNOMED",
  "snomedct": "SNOMED",
  "snomed-ct": "SNOMED",
  "http://snomed.info/sct": "SNOMED",
  "urn:oid:2.16.840.1.113883.6.96": "SNOMED",

  "atc": "ATC",
  "http://www.whocc.no/atc": "ATC",
  "urn:oid:2.16.840.1.113883.6.73": "ATC",

  "loinc": "LOINC",
  "http://loinc.org": "LOINC",
  "urn:oid:2.16.840.1.113883.6.1": "LOINC",
})

/**
 * The vocabulary to look a code up in.
 *
 * Absent means the code came from our own forms, which are ICD-10 based, so the
 * caller's default applies. Present but unrecognised is returned verbatim: it
 * will not match anything in the concept map, and a miss that keeps the code
 * and the system for a human to read is the honest outcome. Silently treating
 * an unknown system as the default is how a code gets resolved against a
 * vocabulary it never belonged to.
 */
export function vocabularyForSystem(
  system: string | null | undefined,
  fallback: string,
): string {
  const key = (system ?? "").trim().toLocaleLowerCase("en")
  if (!key) return fallback
  return KNOWN[key] ?? system!.trim()
}
