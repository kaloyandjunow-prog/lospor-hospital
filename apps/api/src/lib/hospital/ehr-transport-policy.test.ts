import { randomBytes } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  ehrTransportAccess,
  ehrTransportCapabilityState,
  ehrTransportControlView,
  ehrTransportSealKeyFingerprint,
  openEhrTransportCredential,
  readEhrTransportSealKey,
  sealEhrTransportCredential,
} from "./ehr-transport-policy"

const originalMode = process.env.LOSPOR_DEPLOYMENT_MODE
const originalSealFile = process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE
const originalExternalAiSealFile = process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE

afterEach(() => {
  if (originalMode === undefined) delete process.env.LOSPOR_DEPLOYMENT_MODE
  else process.env.LOSPOR_DEPLOYMENT_MODE = originalMode
  if (originalSealFile === undefined) delete process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE
  else process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE = originalSealFile
  if (originalExternalAiSealFile === undefined) delete process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE
  else process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE = originalExternalAiSealFile
})

function sealFile(key = randomBytes(32)) {
  const directory = mkdtempSync(join(tmpdir(), "lospor-ehr-seal-"))
  const path = join(directory, "seal-key")
  writeFileSync(path, `${key.toString("base64")}\n`, { mode: 0o600 })
  return { key, path }
}

function database(policy: Record<string, unknown> | null) {
  return {
    hospitalEhrTransportPolicy: {
      findUnique: vi.fn().mockResolvedValue(policy),
    },
  } as never
}

describe("hospital EHR transport credential sealing", () => {
  it("authenticates the credential and binds it to the transport it was sealed for", () => {
    const key = randomBytes(32)
    const sealed = sealEhrTransportCredential("FHIR", "fhir-secret-value", key)
    expect(sealed.ciphertext).not.toContain("fhir-secret-value")
    expect(openEhrTransportCredential("FHIR", sealed, key)).toBe("fhir-secret-value")
    // A ciphertext sealed for one transport must not open under another, even
    // with the right key -- the AAD binds it to the transport, so a stale row
    // left over after switching transports fails closed instead of being
    // silently reinterpreted as the new transport's credential.
    //
    // Cast because FHIR is the only credentialed transport now that HL7 v2 is
    // withdrawn. The property under test is the binding itself, not that
    // particular value, and it would be a poor trade to drop the assertion
    // that a mismatched credential fails closed.
    expect(() => openEhrTransportCredential("HL7V2" as "FHIR", sealed, key))
      .toThrowError(expect.objectContaining({ code: "EHR_TRANSPORT_CREDENTIAL_UNREADABLE" }))
    expect(() => openEhrTransportCredential("FHIR", { ...sealed, authTag: randomBytes(16).toString("base64") }, key))
      .toThrowError(expect.objectContaining({ code: "EHR_TRANSPORT_CREDENTIAL_UNREADABLE" }))
    expect(() => openEhrTransportCredential("FHIR", sealed, randomBytes(32)))
      .toThrowError(expect.objectContaining({ code: "EHR_TRANSPORT_CREDENTIAL_UNREADABLE" }))
  })

  it("strictly validates the API-only key and fingerprints decoded bytes", () => {
    const { key, path } = sealFile(Buffer.alloc(32, 7))
    expect(readEhrTransportSealKey(path)).toEqual(key)
    expect(ehrTransportSealKeyFingerprint(path)).toMatch(/^sha256:[a-f0-9]{64}$/)

    const invalid = sealFile().path
    writeFileSync(invalid, "not-a-key\n")
    expect(() => readEhrTransportSealKey(invalid)).toThrowError(
      expect.objectContaining({ code: "EHR_TRANSPORT_SEAL_KEY_INVALID" }),
    )
    expect(() => readEhrTransportSealKey(join(tmpdir(), "missing-lospor-ehr-key"))).toThrowError(
      expect.objectContaining({ code: "EHR_TRANSPORT_SEAL_KEY_UNAVAILABLE" }),
    )
  })

  it("uses a seal key file dedicated to EHR transport, distinct from the external-AI one", () => {
    // Both modules follow the same idiom (a 32-byte key file outside the
    // database) but must not accidentally share the same env var: configuring
    // only the external-AI seal key must not silently satisfy the EHR
    // transport module by falling back to it.
    delete process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE
    const { path } = sealFile()
    process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE = path
    expect(() => readEhrTransportSealKey())
      .toThrowError(expect.objectContaining({ code: "EHR_TRANSPORT_SEAL_KEY_UNAVAILABLE" }))
  })
})

describe("hospital EHR transport availability", () => {
  it("is unavailable entirely outside Hospital deployment", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "public"
    const db = database(null)
    await expect(ehrTransportCapabilityState(db)).resolves.toEqual({
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
      transport: null,
      policyEnabled: false,
      credentialStored: false,
      providerConfigured: false,
    })
    expect((db as never as { hospitalEhrTransportPolicy: { findUnique: ReturnType<typeof vi.fn> } })
      .hospitalEhrTransportPolicy.findUnique).not.toHaveBeenCalled()
  })

  it("reports no transport configured when the singleton row does not exist", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    await expect(ehrTransportCapabilityState(database(null))).resolves.toEqual({
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
      transport: null,
      policyEnabled: false,
      credentialStored: false,
      providerConfigured: false,
    })
  })

  it("reports a FOLDER site as fully configured without ever needing a credential", async () => {
    // The trap: a watched directory has no secret, so a FOLDER site must
    // never be reported as "credential missing" the way an unconfigured
    // FHIR/HL7v2 site is. Getting this wrong makes every air-gapped site
    // look permanently broken.
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const state = await ehrTransportCapabilityState(database({
      transport: "FOLDER",
      credentialCiphertext: null,
      credentialNonce: null,
      credentialAuthTag: null,
      credentialKeyVersion: null,
      credentialSealKeyFingerprint: null,
    }))
    expect(state).toEqual({
      enabled: true,
      reason: null,
      transport: "FOLDER",
      policyEnabled: true,
      credentialStored: false,
      providerConfigured: true,
    })
  })

  it("lets a FOLDER site poll without opening any credential", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const db = database({ transport: "FOLDER" })
    await expect(ehrTransportAccess(db)).resolves.toEqual({ enabled: true, transport: "FOLDER" })
  })

  it("reports a chosen FHIR/HL7v2 transport as not ready until a credential is sealed", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const state = await ehrTransportCapabilityState(database({
      transport: "FHIR",
      credentialCiphertext: null,
      credentialNonce: null,
      credentialAuthTag: null,
      credentialKeyVersion: null,
      credentialSealKeyFingerprint: null,
    }))
    expect(state).toEqual({
      enabled: false,
      reason: "CREDENTIAL_NOT_CONFIGURED",
      transport: "FHIR",
      policyEnabled: true,
      credentialStored: false,
      providerConfigured: false,
    })
  })

  it("uses a valid stored credential only when the transport, policy and seal key all agree", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const { key, path } = sealFile()
    process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE = path
    const sealed = sealEhrTransportCredential("FHIR", "fhir-endpoint-secret", key)
    const policy = {
      transport: "FHIR",
      endpoint: "https://fhir.hospital.example/r4",
      credentialCiphertext: sealed.ciphertext,
      credentialNonce: sealed.nonce,
      credentialAuthTag: sealed.authTag,
      credentialKeyVersion: sealed.keyVersion,
      credentialSealKeyFingerprint: sealed.sealKeyFingerprint,
    }
    await expect(ehrTransportAccess(database(policy))).resolves.toEqual({
      enabled: true,
      transport: "FHIR",
      credential: "fhir-endpoint-secret",
      // Read beside the credential rather than out of it: an operator can see
      // where clinical data goes, and how the appliance presents itself,
      // without unsealing anything.
      endpoint: "https://fhir.hospital.example/r4",
      authMode: "STATIC_BEARER",
      tokenUrl: null,
      clientId: null,
      scope: null,
      // Null until a site says which numbering its record numbers live in.
      recordNumberSystem: null,
      // And null until it says which one its ЕГН values live in, which is a
      // separate namespace and a separate answer.
      nationalIdentifierSystem: null,
    })
    await expect(ehrTransportCapabilityState(database(policy))).resolves.toEqual({
      enabled: true,
      reason: null,
      transport: "FHIR",
      policyEnabled: true,
      credentialStored: true,
      providerConfigured: true,
    })
  })

  /**
   * A credential says who we are. It does not say where to send.
   *
   * Reporting this configuration as working is what let the delivery worker
   * claim a finalized case, find no endpoint and fail it *permanently* -- and
   * permanent means destroyed: nothing moves a delivery out of FAILED, and
   * queueFinalizationDeliveries is idempotent on (finalizationId, kind)
   * whatever its status, so re-finalising the same case produces nothing
   * either. Only an amendment would, so a case nobody amended was silently
   * never sent.
   *
   * Refusing here is what keeps the message in the queue until an operator
   * fills the address in.
   */
  it("is not usable with a credential but no endpoint", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const { key, path } = sealFile()
    process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE = path
    const sealed = sealEhrTransportCredential("FHIR", "fhir-endpoint-secret", key)
    const policy = {
      transport: "FHIR",
      endpoint: null,
      credentialCiphertext: sealed.ciphertext,
      credentialNonce: sealed.nonce,
      credentialAuthTag: sealed.authTag,
      credentialKeyVersion: sealed.keyVersion,
      credentialSealKeyFingerprint: sealed.sealKeyFingerprint,
    }

    await expect(ehrTransportAccess(database(policy))).resolves.toEqual({
      enabled: false, transport: "FHIR", reason: "ENDPOINT_NOT_CONFIGURED",
    })

    // And Status names what is actually missing, rather than sending an
    // operator to re-enter a password that was never the problem.
    await expect(ehrTransportCapabilityState(database(policy))).resolves.toMatchObject({
      enabled: false, reason: "ENDPOINT_NOT_CONFIGURED", credentialStored: true,
    })
  })

  it("fails closed when restored ciphertext and the appliance seal key do not match", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const first = sealFile()
    const second = sealFile()
    const sealed = sealEhrTransportCredential("FHIR", "fhir-endpoint-secret", first.key)
    process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE = second.path
    const policy = {
      transport: "FHIR",
      credentialCiphertext: sealed.ciphertext,
      credentialNonce: sealed.nonce,
      credentialAuthTag: sealed.authTag,
      credentialKeyVersion: sealed.keyVersion,
      credentialSealKeyFingerprint: sealed.sealKeyFingerprint,
    }
    await expect(ehrTransportAccess(database(policy))).resolves.toEqual({
      enabled: false,
      transport: "FHIR",
      reason: "CREDENTIAL_NOT_CONFIGURED",
    })
    await expect(ehrTransportCapabilityState(database(policy))).resolves.toEqual({
      enabled: false,
      reason: "CREDENTIAL_NOT_CONFIGURED",
      transport: "FHIR",
      policyEnabled: true,
      credentialStored: true,
      providerConfigured: false,
    })
  })

  it("projects a Status-safe control view shaped like externalAiControlView", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const view = await ehrTransportControlView(database({
      transport: "FOLDER",
      credentialCiphertext: null,
      credentialNonce: null,
      credentialAuthTag: null,
      credentialKeyVersion: null,
      credentialSealKeyFingerprint: null,
      credentialConfiguredAt: null,
      credentialChangedAt: null,
      transportChangedAt: new Date("2026-09-02T08:00:00Z"),
      updatedAt: new Date("2026-09-02T08:00:00Z"),
    }))
    expect(view).toEqual({
      transport: "FOLDER",
      policyEnabled: true,
      credentialStored: false,
      providerConfigured: true,
      capability: "ENABLED",
      // Shown rather than sealed: an operator has to be able to see where
      // clinical data goes, and how the appliance presents itself, without
      // needing the seal key to find out.
      endpoint: null,
      authMode: "STATIC_BEARER",
      tokenUrl: null,
      clientId: null,
      scope: null,
      // The question is still open until a site answers it.
      recordNumberSystem: null,
      recordNumberSystemChangedAt: null,
      endpointChangedAt: null,
      credentialConfiguredAt: null,
      credentialChangedAt: null,
      transportChangedAt: "2026-09-02T08:00:00.000Z",
      updatedAt: "2026-09-02T08:00:00.000Z",
    })
  })
})
