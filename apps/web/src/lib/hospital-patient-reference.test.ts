import { describe, expect, it } from "vitest"
import { readHospitalPatientReference } from "./hospital-patient-reference"

describe("readHospitalPatientReference", () => {
  it("accepts the narrow masked reference returned by the Hospital API", () => {
    expect(readHospitalPatientReference({
      patientReference: { id: "patient-link-1", maskedIdentifier: "00****45" },
    })).toEqual({ id: "patient-link-1", maskedIdentifier: "00****45" })
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
