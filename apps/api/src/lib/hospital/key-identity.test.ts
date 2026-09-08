import { beforeEach, afterAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { checkKeyIdentity, keyFingerprint, keyIdentityMessage } from "./key-identity"

// A restored database running under different keys does not announce itself.
// The appliance starts, serves, accepts cases — and every identifier it writes
// is unrelatable to every identifier already stored, while every pseudonym it
// sends to Central describes a person nobody has seen before. The keys never
// rotate and backups carry only their fingerprints, so this is the one moment
// the mistake is catchable.

const KEYS = {
  HOSPITAL_PATIENT_HMAC_KEY: Buffer.alloc(32, 1).toString("base64"),
  HOSPITAL_PATIENT_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
  HOSPITAL_EXPORT_PSEUDONYM_KEY: Buffer.alloc(32, 3).toString("base64"),
}

function recordFor(env: Record<string, string>, over: Record<string, unknown> = {}) {
  return {
    id: "local",
    patientHmacKeyFingerprint: keyFingerprint(env.HOSPITAL_PATIENT_HMAC_KEY),
    patientEncryptionKeyFingerprint: keyFingerprint(env.HOSPITAL_PATIENT_ENCRYPTION_KEY),
    exportPseudonymKeyFingerprint: keyFingerprint(env.HOSPITAL_EXPORT_PSEUDONYM_KEY),
    overriddenAt: null,
    overrideReason: null,
    ...over,
  }
}

function db(recorded: unknown) {
  const create = vi.fn(async () => recorded)
  return {
    client: {
      hospitalKeyIdentity: {
        findUnique: vi.fn(async () => recorded),
        create,
      },
    } as never,
    create,
  }
}

const original = { ...process.env }

describe("key identity", () => {
  beforeEach(() => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    Object.assign(process.env, KEYS)
  })
  afterAll(() => { process.env = { ...original } })

  it("records the keys on a first start instead of refusing", async () => {
    // The case that must never block: a fresh install has nothing to disagree
    // with, so whatever is loaded is written down as correct.
    const { client, create } = db(null)

    await expect(checkKeyIdentity(client)).resolves.toEqual({ status: "recorded" })
    expect(create).toHaveBeenCalledOnce()
  })

  it("passes when the keys are the ones the database was built with", async () => {
    const { client } = db(recordFor(KEYS))

    await expect(checkKeyIdentity(client)).resolves.toEqual({ status: "ok" })
  })

  it("refuses when the database was built under different keys", async () => {
    // The database remembers; the secrets did not come with it.
    const { client } = db(recordFor({
      ...KEYS,
      HOSPITAL_PATIENT_HMAC_KEY: Buffer.alloc(32, 9).toString("base64"),
    }))

    const state = await checkKeyIdentity(client)
    expect(state).toEqual({ status: "mismatch", mismatched: ["patient lookup"] })
    expect(keyIdentityMessage(state)).toContain("escrow")
  })

  it("names every key that disagrees, not just the first", async () => {
    const { client } = db(recordFor({
      HOSPITAL_PATIENT_HMAC_KEY: Buffer.alloc(32, 9).toString("base64"),
      HOSPITAL_PATIENT_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      HOSPITAL_EXPORT_PSEUDONYM_KEY: Buffer.alloc(32, 9).toString("base64"),
    }))

    const state = await checkKeyIdentity(client)
    expect(state).toMatchObject({ status: "mismatch" })
    if (state.status === "mismatch") expect(state.mismatched).toHaveLength(3)
  })

  it("stops asking once an operator has accepted the mismatch", async () => {
    // Continuing under new keys is a legitimate recovery when the old ones are
    // genuinely gone. It stays recorded rather than being re-recorded, so the
    // evidence that this appliance changed identity is not erased.
    const { client, create } = db(recordFor(
      { ...KEYS, HOSPITAL_PATIENT_HMAC_KEY: Buffer.alloc(32, 9).toString("base64") },
      { overriddenAt: new Date(), overrideReason: "Secrets lost in fire; identities accepted as gone" },
    ))

    const state = await checkKeyIdentity(client)
    expect(state).toMatchObject({ status: "overridden" })
    expect(keyIdentityMessage(state)).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it("reports a missing key as configuration, not as a mismatch", async () => {
    delete process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY
    const { client } = db(recordFor(KEYS))

    const state = await checkKeyIdentity(client)
    expect(state).toEqual({
      status: "unconfigured",
      missing: ["HOSPITAL_EXPORT_PSEUDONYM_KEY"],
    })
  })

  it("says nothing outside a hospital deployment", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "cloud"
    const { client } = db(null)

    await expect(checkKeyIdentity(client)).resolves.toEqual({ status: "ok" })
  })
})
