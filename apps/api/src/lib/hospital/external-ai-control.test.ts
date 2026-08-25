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
  const audit = vi.fn()
  return { transaction, installation, policyFind, policyUpsert, audit }
})

const tx = {
  hospitalInstallation: { findUnique: mocks.installation },
  hospitalExternalAiPolicy: {
    findUnique: mocks.policyFind,
    upsert: mocks.policyUpsert,
  },
}

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: mocks.audit }))

import {
  removeExternalAiCredential,
  replaceExternalAiCredential,
  setExternalAiPolicy,
} from "./control-plane"

const originalSealFile = process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE

afterEach(() => {
  if (originalSealFile === undefined) delete process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE
  else process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE = originalSealFile
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async callback => callback(tx))
  mocks.installation.mockResolvedValue({
    applianceOperator: {
      id: "admin-1",
      role: "ADMIN",
      deletedAt: null,
      activatedAt: new Date("2026-08-22T08:00:00Z"),
    },
  })
  mocks.policyFind.mockResolvedValue(null)
  mocks.audit.mockResolvedValue(undefined)
})

function installSealKey() {
  const directory = mkdtempSync(join(tmpdir(), "lospor-ai-control-"))
  const path = join(directory, "seal-key")
  writeFileSync(path, `${randomBytes(32).toString("base64")}\n`, { mode: 0o600 })
  process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE = path
}

describe("Hospital external AI Status mutations", () => {
  it("changes deployment policy without changing any sealed credential field", async () => {
    mocks.policyUpsert.mockResolvedValue({
      id: "local",
      externalAiEnabled: false,
      provider: "MISTRAL",
      policyChangedAt: new Date("2026-08-22T12:00:00Z"),
    })
    await setExternalAiPolicy({
      externalAiEnabled: false,
      reason: "Disable external AI for local policy",
    })

    const call = mocks.policyUpsert.mock.calls[0]?.[0]
    expect(call.update).toMatchObject({ externalAiEnabled: false })
    expect(Object.keys(call.update)).not.toEqual(expect.arrayContaining([
      "credentialCiphertext", "credentialNonce", "credentialAuthTag", "credentialKeyVersion",
    ]))
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      "admin-1",
      "HOSPITAL_EXTERNAL_AI_POLICY_UPDATE",
      "local",
      expect.objectContaining({ externalAiEnabled: false, provider: "MISTRAL" }),
    )
  })

  it("seals replacement before the same transaction writes metadata and audit", async () => {
    installSealKey()
    const credential = "mistral-secret-value"
    mocks.policyUpsert.mockImplementation(async ({ update }) => ({
      id: "local",
      provider: "MISTRAL",
      credentialConfiguredAt: update.credentialConfiguredAt,
    }))

    const result = await replaceExternalAiCredential({
      credential,
      reason: "Configure the approved Mistral provider",
    })
    const serializedMutation = JSON.stringify(mocks.policyUpsert.mock.calls[0]?.[0])
    const serializedAudit = JSON.stringify(mocks.audit.mock.calls[0])
    expect(serializedMutation).not.toContain(credential)
    expect(serializedAudit).not.toContain(credential)
    expect(mocks.policyUpsert.mock.calls[0]?.[0].update).toMatchObject({
      credentialKeyVersion: 1,
      credentialSealKeyFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      credentialChangedById: "admin-1",
    })
    expect(result).toMatchObject({ provider: "MISTRAL", credentialConfigured: true })
    expect(JSON.stringify(result)).not.toContain(credential)
    expect(mocks.transaction).toHaveBeenCalledOnce()
  })

  it("does not complete a credential mutation when its atomic audit fails", async () => {
    installSealKey()
    mocks.policyUpsert.mockResolvedValue({
      id: "local",
      provider: "MISTRAL",
      credentialConfiguredAt: new Date(),
    })
    mocks.audit.mockRejectedValue(new Error("audit unavailable"))
    await expect(replaceExternalAiCredential({
      credential: "another-mistral-secret",
      reason: "Rotate the approved provider credential",
    })).rejects.toThrow("audit unavailable")
  })

  it("removes every sealed field atomically while retaining safe change evidence", async () => {
    mocks.policyFind.mockResolvedValue({
      credentialCiphertext: "sealed",
      credentialNonce: "nonce",
      credentialAuthTag: "tag",
      credentialKeyVersion: 1,
      credentialSealKeyFingerprint: `sha256:${"a".repeat(64)}`,
      credentialConfiguredAt: new Date(),
    })
    mocks.policyUpsert.mockResolvedValue({ id: "local", provider: "MISTRAL" })
    await removeExternalAiCredential({ reason: "Remove the retired provider credential" })
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
      "HOSPITAL_EXTERNAL_AI_CREDENTIAL_REMOVE",
      "local",
      expect.objectContaining({ configured: false, wasConfigured: true }),
    )
  })
})
