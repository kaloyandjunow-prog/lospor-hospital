import { randomBytes } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => {
  const transaction = vi.fn()
  const installation = vi.fn()
  const policyFind = vi.fn()
  const policyUpsert = vi.fn()
  const policyUpdate = vi.fn()
  const audit = vi.fn()
  return { transaction, installation, policyFind, policyUpsert, policyUpdate, audit }
})

const tx = {
  hospitalInstallation: { findUnique: mocks.installation },
  hospitalEhrTransportPolicy: {
    findUnique: mocks.policyFind,
    upsert: mocks.policyUpsert,
    update: mocks.policyUpdate,
  },
}

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: mocks.audit }))

import {
  removeEhrTransportCredential,
  replaceEhrTransportCredential,
  setEhrTransportPolicy,
} from "./control-plane"

const originalSealFile = process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE

afterEach(() => {
  if (originalSealFile === undefined) delete process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE
  else process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE = originalSealFile
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async callback => callback(tx))
  mocks.installation.mockResolvedValue({
    applianceOperator: {
      id: "admin-1",
      role: "ADMIN",
      deletedAt: null,
      activatedAt: new Date("2026-09-02T08:00:00Z"),
    },
  })
  mocks.policyFind.mockResolvedValue(null)
  mocks.audit.mockResolvedValue(undefined)
})

function installSealKey() {
  const directory = mkdtempSync(join(tmpdir(), "lospor-ehr-control-"))
  const path = join(directory, "seal-key")
  writeFileSync(path, `${randomBytes(32).toString("base64")}\n`, { mode: 0o600 })
  process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE = path
}

describe("Hospital EHR transport Status mutations", () => {
  it("chooses FOLDER for the first time with nothing to clear and no false credentialCleared claim", async () => {
    mocks.policyUpsert.mockResolvedValue({ id: "local", transport: "FOLDER" })
    await setEhrTransportPolicy({ transport: "FOLDER", reason: "Air-gapped site uses a watched directory" })

    const call = mocks.policyUpsert.mock.calls[0]?.[0]
    expect(call.update).toMatchObject({ transport: "FOLDER", credentialCiphertext: null })
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      "admin-1",
      "HOSPITAL_EHR_TRANSPORT_POLICY_UPDATE",
      "local",
      // No row existed before, so nothing was actually cleared -- the audit
      // detail must not claim a credential was removed that never existed.
      expect.objectContaining({ transport: "FOLDER", previousTransport: null, credentialCleared: false }),
    )
  })

  it("never stores a credential for FOLDER even if one somehow reaches the update", async () => {
    mocks.policyFind.mockResolvedValue({ transport: "FHIR", credentialCiphertext: "sealed-for-fhir" })
    mocks.policyUpsert.mockResolvedValue({ id: "local", transport: "FOLDER" })
    await setEhrTransportPolicy({ transport: "FOLDER", reason: "Switching to a watched directory" })

    const call = mocks.policyUpsert.mock.calls[0]?.[0]
    expect(call.update).toMatchObject({
      transport: "FOLDER",
      credentialCiphertext: null,
      credentialNonce: null,
      credentialAuthTag: null,
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      "admin-1",
      "HOSPITAL_EHR_TRANSPORT_POLICY_UPDATE",
      "local",
      expect.objectContaining({ previousTransport: "FHIR", credentialCleared: true }),
    )
  })

  it("clears a stale credential when switching from one credentialed transport to another", async () => {
    // A credential sealed for FHIR cannot open under HL7v2 -- leaving it in
    // place would be dead ciphertext masquerading as configured.
    mocks.policyFind.mockResolvedValue({
      transport: "FHIR",
      credentialCiphertext: "sealed-for-fhir",
    })
    mocks.policyUpsert.mockResolvedValue({ id: "local", transport: "HL7V2" })
    await setEhrTransportPolicy({ transport: "HL7V2", reason: "Switching endpoints to HL7v2" })

    const call = mocks.policyUpsert.mock.calls[0]?.[0]
    expect(call.update).toMatchObject({
      transport: "HL7V2",
      credentialCiphertext: null,
      credentialNonce: null,
      credentialAuthTag: null,
      credentialKeyVersion: null,
      credentialSealKeyFingerprint: null,
      credentialConfiguredAt: null,
      credentialChangedById: "admin-1",
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      "admin-1",
      "HOSPITAL_EHR_TRANSPORT_POLICY_UPDATE",
      "local",
      expect.objectContaining({ previousTransport: "FHIR", credentialCleared: true }),
    )
  })

  it("leaves a matching credential untouched when the transport does not actually change", async () => {
    mocks.policyFind.mockResolvedValue({ transport: "FHIR", credentialCiphertext: "sealed" })
    mocks.policyUpsert.mockResolvedValue({ id: "local", transport: "FHIR" })
    await setEhrTransportPolicy({ transport: "FHIR", reason: "Re-recording the same transport choice" })

    const call = mocks.policyUpsert.mock.calls[0]?.[0]
    expect(Object.keys(call.update)).not.toEqual(expect.arrayContaining(["credentialCiphertext"]))
  })

  it("refuses to seal a credential for a transport that isn't FHIR or HL7v2", async () => {
    mocks.policyFind.mockResolvedValue({ transport: "FOLDER" })
    await expect(replaceEhrTransportCredential({
      credential: "must-not-be-consumed",
      reason: "Attempted credential on a FOLDER site",
    })).rejects.toMatchObject({ code: "EHR_TRANSPORT_NOT_CREDENTIALED" })
    expect(mocks.policyUpdate).not.toHaveBeenCalled()
  })

  it("refuses to seal a credential before any transport has been chosen", async () => {
    mocks.policyFind.mockResolvedValue(null)
    await expect(replaceEhrTransportCredential({
      credential: "must-not-be-consumed",
      reason: "Attempted credential with no transport chosen",
    })).rejects.toMatchObject({ code: "EHR_TRANSPORT_NOT_CREDENTIALED" })
  })

  it("seals the replacement against the transport actually stored, atomically with its audit entry", async () => {
    installSealKey()
    mocks.policyFind.mockResolvedValue({ transport: "FHIR" })
    const credential = "fhir-endpoint-secret"
    mocks.policyUpdate.mockImplementation(async ({ data }) => ({
      id: "local",
      transport: "FHIR",
      credentialConfiguredAt: data.credentialConfiguredAt,
    }))

    const result = await replaceEhrTransportCredential({
      credential,
      reason: "Configure the approved FHIR endpoint credential",
    })
    const serializedMutation = JSON.stringify(mocks.policyUpdate.mock.calls[0]?.[0])
    const serializedAudit = JSON.stringify(mocks.audit.mock.calls[0])
    expect(serializedMutation).not.toContain(credential)
    expect(serializedAudit).not.toContain(credential)
    expect(mocks.policyUpdate.mock.calls[0]?.[0].data).toMatchObject({
      credentialKeyVersion: 1,
      credentialSealKeyFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      credentialChangedById: "admin-1",
    })
    expect(result).toMatchObject({ transport: "FHIR", credentialConfigured: true })
    expect(JSON.stringify(result)).not.toContain(credential)
    expect(mocks.transaction).toHaveBeenCalledOnce()
  })

  it("removes every sealed field atomically while retaining safe change evidence", async () => {
    mocks.policyFind.mockResolvedValue({
      transport: "HL7V2",
      credentialCiphertext: "sealed",
      credentialNonce: "nonce",
      credentialAuthTag: "tag",
      credentialKeyVersion: 1,
      credentialSealKeyFingerprint: `sha256:${"a".repeat(64)}`,
      credentialConfiguredAt: new Date(),
    })
    mocks.policyUpsert.mockResolvedValue({ id: "local", transport: "HL7V2" })
    await removeEhrTransportCredential({ reason: "Remove the retired endpoint credential" })
    expect(mocks.policyUpsert.mock.calls[0]?.[0].update).toMatchObject({
      credentialCiphertext: null,
      credentialNonce: null,
      credentialAuthTag: null,
      credentialKeyVersion: null,
      credentialSealKeyFingerprint: null,
      credentialConfiguredAt: null,
      credentialChangedById: "admin-1",
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      "admin-1",
      "HOSPITAL_EHR_TRANSPORT_CREDENTIAL_REMOVE",
      "local",
      expect.objectContaining({ transport: "HL7V2", configured: false, wasConfigured: true }),
    )
  })
})
