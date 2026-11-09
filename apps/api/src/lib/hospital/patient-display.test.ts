import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { encryptPatientIdentifier } from "@/lib/hospital/patient-identity"
import { admissionNumberVisible, patientDisplayOf } from "@/lib/hospital/patient-display"

const KEY = Buffer.alloc(32, 7).toString("base64")
process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY = KEY

function link(value: string, over: Record<string, unknown> = {}) {
  const base = { institutionId: "inst", identifierHash: `h-${value}`, keyVersion: 2 }
  const sealed = encryptPatientIdentifier(value, { institutionId: base.institutionId, identifierHash: base.identifierHash })
  return {
    ...base,
    identifierCiphertext: sealed.ciphertext,
    identifierNonce: sealed.nonce,
    identifierAuthTag: sealed.authTag,
    ...over,
  }
}

describe("patientDisplayOf", () => {
  it("returns the full ИЗ № with its year and cuts a known ЕГН to its first six digits", () => {
    const display = patientDisplayOf({
      id: "a", identifierType: "IZ", identifierYear: 2026, ...link("1234"),
      personLink: link("8001010008"),
    } as never)
    expect(display).toEqual({ admissionNumber: "1234/2026", egnPrefix: "800101" })
    expect(JSON.stringify(display)).not.toContain("0008")
  })

  it("shows the number alone when no person is linked, and nothing when there is no link", () => {
    expect(patientDisplayOf({ id: "a", identifierType: "IZ", identifierYear: 2026, ...link("77"), personLink: null } as never))
      .toEqual({ admissionNumber: "77/2026", egnPrefix: null })
    expect(patientDisplayOf(null)).toBeNull()
  })

  it("shows nothing for a row that will not open, instead of failing the list", () => {
    const broken = { id: "a", identifierType: "IZ", identifierYear: 2026, ...link("5"), identifierAuthTag: "AAAAAAAAAAAAAAAAAAAAAA==", personLink: null }
    expect(patientDisplayOf(broken as never)).toBeNull()
  })
})

describe("admissionNumberVisible", () => {
  it("is on by default and off only when the policy says so", async () => {
    const db = (row: unknown) => ({ hospitalPatientIdentifierPolicy: { findUnique: vi.fn(async () => row) } }) as never
    expect(await admissionNumberVisible(db(null))).toBe(true)
    expect(await admissionNumberVisible(db({ egnPermitted: true, admissionNumberVisible: false }))).toBe(false)
  })
  it("hides the number when the policy cannot be read", async () => {
    const db = { hospitalPatientIdentifierPolicy: { findUnique: vi.fn(async () => { throw new Error("down") }) } } as never
    expect(await admissionNumberVisible(db)).toBe(false)
  })
})
