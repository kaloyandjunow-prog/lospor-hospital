import { randomBytes } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  externalAiCapabilityState,
  externalAiProviderAccess,
  externalAiSealKeyFingerprint,
  openExternalAiCredential,
  readExternalAiSealKey,
  sealExternalAiCredential,
} from "./external-ai-policy"

const originalMode = process.env.LOSPOR_DEPLOYMENT_MODE
const originalMistralKey = process.env.MISTRAL_API_KEY
const originalSealFile = process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE

afterEach(() => {
  if (originalMode === undefined) delete process.env.LOSPOR_DEPLOYMENT_MODE
  else process.env.LOSPOR_DEPLOYMENT_MODE = originalMode
  if (originalMistralKey === undefined) delete process.env.MISTRAL_API_KEY
  else process.env.MISTRAL_API_KEY = originalMistralKey
  if (originalSealFile === undefined) delete process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE
  else process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE = originalSealFile
})

function sealFile(key = randomBytes(32)) {
  const directory = mkdtempSync(join(tmpdir(), "lospor-ai-seal-"))
  const path = join(directory, "seal-key")
  writeFileSync(path, `${key.toString("base64")}\n`, { mode: 0o600 })
  return { key, path }
}

function database(policy: Record<string, unknown> | null) {
  return {
    hospitalExternalAiPolicy: {
      findUnique: vi.fn().mockResolvedValue(policy),
    },
  } as never
}

describe("hospital external AI credential sealing", () => {
  it("authenticates the credential and fixed provider binding", () => {
    const key = randomBytes(32)
    const sealed = sealExternalAiCredential("mistral-secret-value", key)
    expect(sealed.ciphertext).not.toContain("mistral-secret-value")
    expect(openExternalAiCredential(sealed, key)).toBe("mistral-secret-value")
    expect(() => openExternalAiCredential({ ...sealed, authTag: randomBytes(16).toString("base64") }, key))
      .toThrowError(expect.objectContaining({ code: "EXTERNAL_AI_CREDENTIAL_UNREADABLE" }))
    expect(() => openExternalAiCredential(sealed, randomBytes(32)))
      .toThrowError(expect.objectContaining({ code: "EXTERNAL_AI_CREDENTIAL_UNREADABLE" }))
  })

  it("strictly validates the API-only key and fingerprints decoded bytes", () => {
    const { key, path } = sealFile(Buffer.alloc(32, 7))
    expect(readExternalAiSealKey(path)).toEqual(key)
    expect(externalAiSealKeyFingerprint(path)).toMatch(/^sha256:[a-f0-9]{64}$/)

    const invalid = sealFile().path
    writeFileSync(invalid, "not-a-key\n")
    expect(() => readExternalAiSealKey(invalid)).toThrowError(
      expect.objectContaining({ code: "EXTERNAL_AI_SEAL_KEY_INVALID" }),
    )
    expect(() => readExternalAiSealKey(join(tmpdir(), "missing-lospor-ai-key"))).toThrowError(
      expect.objectContaining({ code: "EXTERNAL_AI_SEAL_KEY_UNAVAILABLE" }),
    )
  })
})

describe("hospital external AI availability", () => {
  it("never falls back to an environment Mistral key in Hospital mode", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    process.env.MISTRAL_API_KEY = "must-not-be-used"
    const access = await externalAiProviderAccess(database({
      externalAiEnabled: true,
      credentialCiphertext: null,
      credentialNonce: null,
      credentialAuthTag: null,
      credentialKeyVersion: null,
      credentialSealKeyFingerprint: null,
    }))
    expect(access).toEqual({
      enabled: false,
      provider: "MISTRAL",
      reason: "PROVIDER_NOT_CONFIGURED",
    })
  })

  it("reports deployment-disabled before trying to open a stored credential", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const state = await externalAiCapabilityState(database({
      externalAiEnabled: false,
      credentialCiphertext: "sealed",
      credentialNonce: "nonce",
      credentialAuthTag: "tag",
      credentialKeyVersion: 1,
      credentialSealKeyFingerprint: `sha256:${"a".repeat(64)}`,
    }))
    expect(state).toMatchObject({
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
      credentialStored: true,
      providerConfigured: false,
    })
  })

  it("preserves the public deployment's existing environment-key behavior", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "public"
    process.env.MISTRAL_API_KEY = "public-demo-key"
    const db = database(null)
    const access = await externalAiProviderAccess(db)
    expect(access).toEqual({ enabled: true, provider: "MISTRAL", apiKey: "public-demo-key" })
    expect((db as never as { hospitalExternalAiPolicy: { findUnique: ReturnType<typeof vi.fn> } })
      .hospitalExternalAiPolicy.findUnique).not.toHaveBeenCalled()
  })

  it("uses a valid stored credential only when policy and seal key are ready", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const { key, path } = sealFile()
    process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE = path
    const sealed = sealExternalAiCredential("hospital-mistral-key", key)
    const policy = {
      externalAiEnabled: true,
      credentialCiphertext: sealed.ciphertext,
      credentialNonce: sealed.nonce,
      credentialAuthTag: sealed.authTag,
      credentialKeyVersion: sealed.keyVersion,
      credentialSealKeyFingerprint: sealed.sealKeyFingerprint,
    }
    await expect(externalAiProviderAccess(database(policy))).resolves.toEqual({
      enabled: true,
      provider: "MISTRAL",
      apiKey: "hospital-mistral-key",
    })
    await expect(externalAiCapabilityState(database(policy))).resolves.toMatchObject({
      enabled: true,
      reason: null,
      credentialStored: true,
      providerConfigured: true,
    })
  })

  it("fails closed when restored ciphertext and the appliance seal key do not match", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const first = sealFile()
    const second = sealFile()
    const sealed = sealExternalAiCredential("hospital-mistral-key", first.key)
    process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE = second.path
    const policy = {
      externalAiEnabled: true,
      credentialCiphertext: sealed.ciphertext,
      credentialNonce: sealed.nonce,
      credentialAuthTag: sealed.authTag,
      credentialKeyVersion: sealed.keyVersion,
      credentialSealKeyFingerprint: sealed.sealKeyFingerprint,
    }
    await expect(externalAiProviderAccess(database(policy))).resolves.toEqual({
      enabled: false,
      provider: "MISTRAL",
      reason: "PROVIDER_NOT_CONFIGURED",
    })
    await expect(externalAiCapabilityState(database(policy))).resolves.toMatchObject({
      enabled: false,
      reason: "PROVIDER_NOT_CONFIGURED",
      credentialStored: true,
      providerConfigured: false,
    })
  })
})
