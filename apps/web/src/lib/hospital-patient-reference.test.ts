import { describe, expect, it } from "vitest"
import { readHospitalPatientReference, readPatientDisplay } from "./hospital-patient-reference"

describe("readHospitalPatientReference", () => {
  it("accepts the narrow masked reference returned by the Hospital API", () => {
    expect(readHospitalPatientReference({
      patientReference: { id: "patient-link-1", maskedIdentifier: "00****45" },
    })).toEqual({ id: "patient-link-1", maskedIdentifier: "00****45", personMaskedIdentifier: null, display: null })
  })

  it.each([
    null,
    {},
    { patientReference: null },
    { patientReference: { id: "patient-link-1" } },
    { patientReference: { id: 1, maskedIdentifier: "00****45" } },
    { patientReference: { id: "patient-link-1", maskedIdentifier: 123 } },
    // Fail closed if a server regression ever returns the raw identifier.
    { patientReference: { id: "patient-link-1", maskedIdentifier: "00012345" } },
  ])("does not expose malformed or potentially raw server data: %j", body => {
    expect(readHospitalPatientReference(body)).toBeNull()
  })
})

describe("readPatientDisplay (hospital 1.8.0)", () => {
  it("reads the number as written and a six-digit ЕГН prefix", () => {
    expect(readPatientDisplay({ admissionNumber: "1234/2026", egnPrefix: "800101" })).toEqual({ admissionNumber: "1234/2026", egnPrefix: "800101" })
    expect(readPatientDisplay({ admissionNumber: "77/2026", egnPrefix: null })).toEqual({ admissionNumber: "77/2026", egnPrefix: null })
  })

  it("drops anything that is not a number or a six-digit prefix, so a full ЕГН can never be printed", () => {
    expect(readPatientDisplay({ admissionNumber: null, egnPrefix: "8001010008" })).toBeNull()
    expect(readPatientDisplay({ admissionNumber: "<b>1</b>", egnPrefix: null })).toBeNull()
    expect(readPatientDisplay(null)).toBeNull()
    expect(readPatientDisplay("1234")).toBeNull()
  })

  it("travels with the patient reference", () => {
    const reference = readHospitalPatientReference({
      patientReference: { id: "p1", maskedIdentifier: "12**" },
      patientDisplay: { admissionNumber: "12/2026", egnPrefix: null },
    })
    expect(reference?.display).toEqual({ admissionNumber: "12/2026", egnPrefix: null })
  })
})
