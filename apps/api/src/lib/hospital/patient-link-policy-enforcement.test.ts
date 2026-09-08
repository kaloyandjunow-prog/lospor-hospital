import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { resolvePatientLink, resolvePatientIdentity } from "./patient-link"
import { PatientIdentifierPolicyError } from "./patient-identifier-policy"

// The policy is only worth having if it reaches the one function that creates
// links. These pin that a disabled site cannot record a national identifier by
// any route, and — just as important — that turning it off does not disturb
// the record numbers every case depends on.

process.env.HOSPITAL_PATIENT_HMAC_KEY ??= Buffer.alloc(32, 1).toString("base64")
process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY ??= Buffer.alloc(32, 2).toString("base64")

function client(egnPermitted: boolean) {
  const findUnique = vi.fn()
    .mockResolvedValueOnce(null)   // current digest misses
    .mockResolvedValueOnce(null)   // version 1 digest misses
    .mockResolvedValue({ id: "link-1", maskedIdentifier: "00****42" })
  return {
    hospitalPatientIdentifierPolicy: { findUnique: vi.fn(async () => ({ egnPermitted })) },
    patientLink: {
      findUnique,
      createMany: vi.fn(async () => ({ count: 1 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as never
}

describe("national identifiers obey the site policy", () => {
  beforeEach(() => { delete process.env.HOSPITAL_EGN_POLICY_DEFAULT })

  it("refuses to create an ЕГН link when the site has turned it off", async () => {
    await expect(
      resolvePatientLink(client(false), "inst-1", "8001015555", "user-1", "EGN"),
    ).rejects.toBeInstanceOf(PatientIdentifierPolicyError)
  })

  it("still records the record number when ЕГН is off", async () => {
    // A site that declines national identifiers must keep operating normally.
    // ИЗ № is what opens a case; refusing it would stop surgery being
    // documented, which no privacy setting may ever do.
    await expect(
      resolvePatientLink(client(false), "inst-1", "42", "user-1", "IZ"),
    ).resolves.toMatchObject({ id: "link-1" })
  })

  it("refuses through the combined resolver too, not only the primitive", async () => {
    // resolvePatientIdentity is the path an import would take, so the check
    // has to hold there rather than only on the function it happens to call.
    await expect(resolvePatientIdentity(
      client(false), "inst-1", { recordNumber: "42", nationalId: "8001015555" }, "user-1",
    )).rejects.toBeInstanceOf(PatientIdentifierPolicyError)
  })

  it("records both halves when the site permits it", async () => {
    const identity = await resolvePatientIdentity(
      client(true), "inst-1", { recordNumber: "42", nationalId: "8001015555" }, "user-1",
    )
    expect(identity.admission.id).toBe("link-1")
    expect(identity.person?.id).toBe("link-1")
  })
})
