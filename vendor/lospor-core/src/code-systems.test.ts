import { describe, expect, it } from "vitest"

import { vocabularyForSystem } from "./code-systems"

/**
 * The system a code came from decides what the code means. `250` is diabetes in
 * ICD-9 and nothing in ICD-10; looking a code up in the wrong vocabulary is
 * usually a miss, which is safe, and occasionally a hit, which is a confidently
 * wrong diagnosis on somebody's record.
 */
describe("which vocabulary a hospital's code came from", () => {
  it("recognises the same vocabulary however it is written", () => {
    // FHIR names systems by URI; interfaces written by hand use short names.
    for (const written of ["ICD10", "icd-10", "http://hl7.org/fhir/sid/icd-10", "urn:oid:2.16.840.1.113883.6.3"]) {
      expect(vocabularyForSystem(written, "ICD10"), written).toBe("ICD10")
    }
    expect(vocabularyForSystem("http://snomed.info/sct", "ICD10")).toBe("SNOMED")
    expect(vocabularyForSystem("http://loinc.org", "ICD10")).toBe("LOINC")
    expect(vocabularyForSystem("http://www.whocc.no/atc", "ICD10")).toBe("ATC")
  })

  it("uses the caller's default when no system was given", () => {
    // Our own forms are ICD-10 based and send no system, so this is the
    // ordinary case and must keep behaving as it always has.
    expect(vocabularyForSystem(undefined, "ICD10")).toBe("ICD10")
    expect(vocabularyForSystem("", "ICD10")).toBe("ICD10")
    expect(vocabularyForSystem("   ", "ICD10")).toBe("ICD10")
  })

  /**
   * The point of the whole module. An unknown system must not be quietly
   * treated as the default -- that is precisely how an ICD-9 code gets resolved
   * against ICD-10 and lands a different disease on the record.
   */
  it("does not guess when it does not recognise the system", () => {
    expect(vocabularyForSystem("http://hospital.bg/local-codes", "ICD10"))
      .toBe("http://hospital.bg/local-codes")
    // Which will not match anything in the concept map, so the code and its
    // system survive for a human to read instead of resolving to a wrong one.
    expect(vocabularyForSystem("ICD9CM", "ICD10")).toBe("ICD9CM")
  })
})
