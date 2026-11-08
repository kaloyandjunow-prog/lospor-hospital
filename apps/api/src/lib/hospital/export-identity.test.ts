import { afterEach, describe, expect, it, vi } from "vitest"
import { exportIdentityByCase } from "./export-identity"

afterEach(() => vi.unstubAllEnvs())

describe("the identity every hospital OMOP export uses", () => {
  it("joins a patient's admissions through the ЕГН, falls back to the admission, and never puts a number in the file", () => {
    vi.stubEnv("HOSPITAL_EXPORT_PSEUDONYM_KEY", Buffer.alloc(32, 7).toString("base64"))
    const person = { identifierHash: "person-hash", institutionId: "inst" }
    const identity = exportIdentityByCase([
      { id: "admission-2025", institutionId: "inst", patientLink: { identifierHash: "iz-2025", institutionId: "inst", personLink: person } },
      { id: "admission-2026", institutionId: "inst", patientLink: { identifierHash: "iz-2026", institutionId: "inst", personLink: person } },
      { id: "no-egn", institutionId: "inst", patientLink: { identifierHash: "iz-other", institutionId: "inst", personLink: null } },
      { id: "no-link", institutionId: "inst", patientLink: null },
      { id: "other-hospital", institutionId: "inst", patientLink: { identifierHash: "iz-x", institutionId: "elsewhere", personLink: null } },
    ])
    expect(identity["admission-2025"]!.personKey).toBe("person-hash")
    expect(identity["admission-2025"]!.personSourceValue).toBe(identity["admission-2026"]!.personSourceValue)
    expect(identity["no-egn"]!.personKey).toBe("iz-other")
    expect(identity["no-egn"]!.personSourceValue).not.toBe(identity["admission-2025"]!.personSourceValue)
    expect(identity["no-link"]).toBeUndefined()
    expect(identity["other-hospital"]).toBeUndefined()
    expect(identity["admission-2025"]!.personSourceValue).toMatch(/^[0-9a-f]{64}$/)
  })
})
