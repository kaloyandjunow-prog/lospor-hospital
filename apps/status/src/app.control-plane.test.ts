import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthService } from "./auth.js"
import { createStatusApp } from "./app.js"
import type { StatusConfig } from "./config.js"
import { ControlPlaneClientError, type ControlPlanePort, type ControlPlaneView } from "./control-plane.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"

const NOW = Date.parse("2026-08-22T12:00:00.000Z")
const HASH = "a".repeat(64)
const ADULT_BASELINE_HASH = "f".repeat(64)
const PEDIATRIC_BASELINE_HASH = "9".repeat(64)
const VIEW: ControlPlaneView = {
  schemaVersion: 3,
  pediatricMode: {
    enabled: true,
    productionReady: false,
    releaseReviewed: true,
    rulesetVersion: "pediatric-v2",
    bundledRulesetVersion: "pediatric-v2",
    minimumClientVersion: "8.0.0",
    reviewedDoseProfilesRequired: true,
  },
  research: {
    policy: { defaultExpiryDays: 90, maximumExpiryDays: 365 },
    accounts: [{
      id: "clinician-1",
      email: "doctor@example.test",
      name: "д-р Ива Петрова",
      institutionId: "inst-1",
      accountKind: "CLINICAL",
      role: "HEAD_OF_DEPT",
    }],
    institutions: [{ id: "inst-1", name: "УМБАЛ Тест" }],
    grants: [],
    omopRequests: [{
      id: "export-1",
      requesterId: "clinician-1",
      requesterName: "д-р Ива Петрова",
      requesterEmail: "doctor@example.test",
      name: "Protocol cohort",
      purpose: "Approved protocol 42",
      format: "omop-csv",
      grantId: "grant-1",
      definitionHash: HASH,
      snapshotHash: "b".repeat(64),
      snapshotCaseCount: 17,
      scopeInstitutionIds: ["inst-1"],
      createdAt: "2026-08-22T11:00:00.000Z",
    }],
  },
  central: {
    disabledByDefault: true,
    pushOnly: true,
    credentialsPresent: true,
    endpoint: "https://central.example.test",
    siteId: "site-id-1",
    siteCode: "SITE_1",
    institutionId: "inst-1",
    transportLocked: true,
    transportConfigurationHash: "c".repeat(64),
    transportConfiguredAt: "2026-08-21T08:00:00.000Z",
    clientCertificate: {
      fingerprintSha256: "d".repeat(64),
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2027-08-01T00:00:00.000Z",
    },
    caCertificate: {
      fingerprintSha256: "e".repeat(64),
      validFrom: "2025-01-01T00:00:00.000Z",
      validTo: "2030-01-01T00:00:00.000Z",
    },
    signingKeyId: "hospital-signing-key-1",
    centralEncryptionKeyId: "central-encryption-key-1",
    receiptSigningKeyId: "central-receipt-key-1",
    compatibility: {
      localManifestVersion: "1",
      supportedManifestVersions: ["1", "2"],
      compatible: true,
      maximumUploadBytes: 67_108_864,
      multipartChunkBytes: 4_194_304,
    },
    enrolled: true,
    enrolledAt: "2026-08-21T08:00:00.000Z",
    lastCapabilitiesAt: "2026-08-22T10:00:00.000Z",
    lastDeliveryAt: "2026-08-22T11:00:00.000Z",
    nextSequence: 1,
    lastAcceptedBatchId: null,
    policy: null,
    casesAwaitingExport: 0,
    queuesByStatus: { RETRY: 1 },
    batches: [{
      id: "batch-1",
      sequence: 7,
      status: "RETRY",
      cutoffFrom: null,
      cutoffTo: "2026-08-22T11:00:00.000Z",
      manifestHash: null,
      ciphertextSha256: null,
      receiptHash: null,
      attemptCount: 1,
      nextAttemptAt: "2026-08-22T12:30:00.000Z",
      errorCode: null,
      createdAt: "2026-08-22T11:00:00.000Z",
      generatedAt: null,
      acceptedAt: null,
      caseCount: 17,
    }],
  },
  guidance: {
    adultEnabled: true,
    pediatricEnabled: false,
    updatedAt: null,
    baselines: {
      adult: {
        mode: "ADULT",
        baselineReady: true,
        reasonCode: "READY",
        expected: {
          presetId: "lospor-adults-v2",
          key: "LOSPOR_ADULTS",
          version: 2,
          digestSha256: ADULT_BASELINE_HASH,
          ruleCount: 3,
          profileCounts: { drug: 1, infusion: 1, fluid: 1, total: 3 },
        },
        selected: {
          presetId: "lospor-adults-v2",
          key: "LOSPOR_ADULTS",
          version: 2,
          status: "PUBLISHED",
          digestSha256: ADULT_BASELINE_HASH,
          ruleCount: 3,
          profileCounts: { drug: 1, infusion: 1, fluid: 1, total: 3 },
        },
      },
      pediatric: {
        mode: "PEDIATRIC",
        baselineReady: false,
        reasonCode: "SELECTION_MISSING",
        expected: {
          presetId: "lospor-pediatrics-v2",
          key: "LOSPOR_PEDIATRICS",
          version: 2,
          digestSha256: PEDIATRIC_BASELINE_HASH,
          ruleCount: 4,
          profileCounts: { drug: 2, infusion: 1, fluid: 1, total: 4 },
        },
        selected: null,
      },
    },
  },
  externalAi: {
    externalAiEnabled: true,
    provider: "MISTRAL",
    credentialStored: true,
    providerConfigured: true,
    capability: "ENABLED",
    credentialConfiguredAt: "2026-08-20T08:00:00.000Z",
    credentialChangedAt: "2026-08-21T08:00:00.000Z",
    policyChangedAt: "2026-08-22T08:00:00.000Z",
    updatedAt: "2026-08-22T08:00:00.000Z",
  },
  patientIdentifier: {
    egnPermitted: true,
    changeReasonRecorded: true,
    changedAt: "2026-08-19T08:00:00.000Z",
    updatedAt: "2026-08-19T08:00:00.000Z",
  },
}

const databases: StatusDatabase[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
})

function setup() {
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  const auth = new AuthService(db, Buffer.alloc(32, 9), 4, () => NOW)
  const controlPlane: ControlPlanePort = {
    get: vi.fn(async () => VIEW),
    issueGrant: vi.fn(async () => {}),
    revokeGrant: vi.fn(async () => {}),
    approveOmop: vi.fn(async () => {}),
    configureCentral: vi.fn(async () => {}),
    setCentralPolicy: vi.fn(async () => {}),
    retryCentralBatch: vi.fn(async () => {}),
    setGuidance: vi.fn(async () => {}),
    setExternalAiPolicy: vi.fn(async () => {}),
    replaceExternalAiCredential: vi.fn(async () => {}),
    removeExternalAiCredential: vi.fn(async () => {}),
    setPatientIdentifierPolicy: vi.fn(async () => {}),
  }
  const config = {
    defaultLocale: "bg",
    basePath: "/status",
    eventTokens: new Map(),
    rateLimitKey: Buffer.alloc(32, 3),
    snapshotToken: "s".repeat(32),
    probeTimeoutMs: 1_000,
  } as unknown as StatusConfig
  return {
    auth,
    controlPlane,
    app: createStatusApp({ db, auth, config, controlPlane, now: () => NOW }),
  }
}

function origin(extra: Record<string, string> = {}) {
  return {
    origin: "https://hospital.test",
    host: "hospital.test",
    "x-forwarded-proto": "https",
    ...extra,
  }
}

async function passwordCookie(_app: ReturnType<typeof setup>["app"], auth: AuthService) {
  await auth.initialize("admin@hospital.test", "Initial password phrase1!")
  const challenge = await auth.beginPasswordLogin({
    email: "admin@hospital.test",
    password: "Initial password phrase1!",
    clientAddress: "127.0.0.1",
  })
  const result = auth.completeMfaLogin({
    challengeToken: challenge.challengeToken,
    code: totpCode(challenge.manualKey!, NOW),
    clientAddress: "127.0.0.1",
  })
  return `lospor_status_session=${result.sessionToken}`
}

async function recoveryCookie(app: ReturnType<typeof setup>["app"], auth: AuthService) {
  await auth.initialize("admin@hospital.test", "Initial password phrase1!")
  const recovery = auth.createRecoveryToken()
  const response = await app.request("/status/login", {
    method: "POST",
    headers: origin({ "content-type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ recoveryToken: recovery.token }),
  })
  return response.headers.get("set-cookie")?.split(";")[0] ?? ""
}

describe("Status Hospital control plane", () => {
  it("shows Bulgarian metadata, exact hashes, and no secret or clinical payload fields", async () => {
    const { app, auth, controlPlane } = setup()
    const cookie = await passwordCookie(app, auth)
    const response = await app.request("/status/control", { headers: { cookie } })
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).toContain('<html lang="bg">')
    expect(body).toContain("Точни одобрения за OMOP")
    expect(body).toContain(HASH)
    expect(body).toContain("Допустим активен профил")
    expect(body).toContain("началник на отделение")
    expect(body).not.toContain("HEAD_OF_DEPT")
    expect(body).toContain("Изключено по подразбиране")
    expect(body).toContain("https://central.example.test")
    expect(body).toContain("hospital-signing-key-1")
    expect(body).toContain("Клиентският сертификат е валиден от")
    expect(body).toContain("CA за Central е валиден до")
    expect(body).toContain("Външен ИИ (Mistral)")
    expect(body).toContain("central-encryption-key-1")
    expect(body).toContain("Версии на манифеста, поддържани от Central")
    expect(body).toContain("67_108_864".replaceAll("_", ""))
    expect(body).toContain("4194304")
    expect(body).toContain("Данните за достъп са настроени на")
    expect(body).toContain("Политика за национален идентификатор (ЕГН)")
    expect(body).toContain("Разрешено свързване с национален идентификатор (ЕГН)")
    expect(body).toContain("Документиране на педиатрични случаи")
    expect(body).toContain("постоянна възможност на Hospital")
    expect(body).toContain("pediatric-v2")
    expect(body).toContain("Готовност на базовата конфигурация")
    expect(body).toContain("Не е готово")
    expect(body).toContain("Няма избрана базова конфигурация за цялата система")
    expect(body).toContain("Политиката е включена")
    expect(body).toContain("Публикуван")
    expect(body).not.toContain("PUBLISHED")
    expect(body).toContain(ADULT_BASELINE_HASH)
    expect(body).toContain(PEDIATRIC_BASELINE_HASH)
    expect(body).toContain("Опашки: Нов опит: 1")
    expect(body).toContain("#7 · Нов опит")
    expect(body).not.toContain('{&quot;RETRY&quot;')
    expect(body).toContain('name="credential" type="password"')
    expect(body).not.toContain("clientCertificatePem")
    expect(body).not.toContain("enrollmentToken")
    expect(body).not.toContain("patientName")
    expect(body).not.toContain("credentialCiphertext")
    expect(body).not.toContain("credentialAuthTag")
    expect(controlPlane.get).toHaveBeenCalledOnce()
  })

  it("keeps recovery sessions away from every Hospital control", async () => {
    const { app, auth, controlPlane } = setup()
    const cookie = await recoveryCookie(app, auth)
    const page = await app.request("/status/control", { headers: { cookie } })
    expect(page.status).toBe(403)
    const mutation = await app.request("/status/control/guidance", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ password: "Initial password phrase1!", reason: "Policy change reason" }),
    })
    expect(mutation.status).toBe(403)
    expect(controlPlane.setGuidance).not.toHaveBeenCalled()
  })

  it("requires the current password before issuing a granular grant", async () => {
    const { app, auth, controlPlane } = setup()
    const cookie = await passwordCookie(app, auth)
    const base = {
      userId: "clinician-1",
      institutionId: "inst-1",
      purpose: "Approved protocol 42",
      expiryDays: "90",
      canQuery: "true",
      canExportCsv: "true",
    }
    const refused = await app.request("/status/control/research/grants", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ ...base, password: "Wrong password" }),
    })
    expect(refused.status).toBe(401)
    expect(controlPlane.issueGrant).not.toHaveBeenCalled()

    const accepted = await app.request("/status/control/research/grants", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ ...base, password: "Initial password phrase1!" }),
    })
    expect(accepted.status).toBe(200)
    expect(controlPlane.issueGrant).toHaveBeenCalledWith(expect.objectContaining({
      userId: "clinician-1",
      institutionId: "inst-1",
      allInstitutions: false,
      expiryDays: 90,
      canQuery: true,
      canExportCsv: true,
      canExportJson: false,
      canExportOmop: false,
    }))
    expect(await accepted.text()).not.toContain("Initial password phrase1!")
  })

  it("reauthenticates the transport and clinical-export locks as separate actions", async () => {
    const { app, auth, controlPlane } = setup()
    const cookie = await passwordCookie(app, auth)
    const headers = origin({ cookie, "content-type": "application/x-www-form-urlencoded" })
    const transport = await app.request("/status/control/central/transport", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        token: "T".repeat(32),
        centralBaseUrl: "https://central.example.test/enroll",
        siteCode: "SITE_1",
        siteName: "Hospital site",
        institutionId: "inst-1",
        reason: "Initial private transport lock",
        password: "Initial password phrase1!",
      }),
    })
    expect(transport.status).toBe(200)
    expect(controlPlane.configureCentral).toHaveBeenCalledOnce()
    expect(controlPlane.setCentralPolicy).not.toHaveBeenCalled()

    const policy = await app.request("/status/control/central/policy", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        enabled: "true",
        includeRedactedText: "true",
        redactionProfile: "bg-en-v1",
        reason: "Approved clinical export policy",
        password: "Initial password phrase1!",
      }),
    })
    expect(policy.status).toBe(200)
    expect(controlPlane.setCentralPolicy).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
  })

  it("renders the complete control surface in English when EN is selected", async () => {
    const { app, auth } = setup()
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control", {
      headers: { cookie: `${session}; lospor_status_locale=en` },
    })
    const body = await response.text()
    expect(body).toContain('<html lang="en">')
    expect(body).toContain("Exact OMOP approvals")
    expect(body).toContain("Central automatic clinical delivery")
    expect(body).toContain("every eligible finalized case is queued automatically")
    expect(body).toContain("clinicians do not approve cases one by one")
    expect(body).toContain("Prospective calculation guidance")
    expect(body).toContain("Pediatric charting")
    expect(body).toContain("fixed Hospital capability")
    expect(body).toContain("Baseline readiness")
    expect(body).toContain("Not ready")
    expect(body).toContain("No platform baseline is selected")
    expect(body).toContain("Policy enabled")
    expect(body).toContain("External AI (Mistral)")
  })

  it("explains that clinical export approval is required before a retry", async () => {
    const { app, auth, controlPlane } = setup()
    controlPlane.retryCentralBatch = vi.fn(async () => {
      throw new ControlPlaneClientError("CENTRAL_CLINICAL_EXPORT_NOT_ENABLED")
    })
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/central/batches/batch-1/retry", {
      method: "POST",
      headers: origin({
        cookie: `${session}; lospor_status_locale=en`,
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams({
        reason: "Retry after transport review",
        password: "Initial password phrase1!",
      }),
    })
    expect(response.status).toBe(409)
    expect(await response.text()).toContain("Enable and approve Central clinical export before retrying a batch.")
  })

  it("reauthenticates external-AI policy and passes only its explicit policy input", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const headers = origin({
      cookie: `${session}; lospor_status_locale=en`,
      "content-type": "application/x-www-form-urlencoded",
    })
    const refused = await app.request("/status/control/external-ai/policy", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        externalAiEnabled: "true",
        reason: "Approved hospital external AI policy",
        password: "wrong password",
      }),
    })
    expect(refused.status).toBe(401)
    expect(controlPlane.setExternalAiPolicy).not.toHaveBeenCalled()

    const accepted = await app.request("/status/control/external-ai/policy", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        externalAiEnabled: "true",
        reason: "Approved hospital external AI policy",
        password: "Initial password phrase1!",
      }),
    })
    expect(accepted.status).toBe(200)
    expect(controlPlane.setExternalAiPolicy).toHaveBeenCalledWith({
      externalAiEnabled: true,
      reason: "Approved hospital external AI policy",
    })
  })

  it("reauthenticates the national-identifier policy and passes only its explicit policy input", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const headers = origin({
      cookie: `${session}; lospor_status_locale=en`,
      "content-type": "application/x-www-form-urlencoded",
    })
    const refused = await app.request("/status/control/patient-identifier", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        reason: "Site will not hold national identifiers",
        password: "wrong password",
      }),
    })
    expect(refused.status).toBe(401)
    expect(controlPlane.setPatientIdentifierPolicy).not.toHaveBeenCalled()

    const accepted = await app.request("/status/control/patient-identifier", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        reason: "Site will not hold national identifiers",
        password: "Initial password phrase1!",
      }),
    })
    expect(accepted.status).toBe(200)
    expect(controlPlane.setPatientIdentifierPolicy).toHaveBeenCalledWith({
      egnPermitted: false,
      reason: "Site will not hold national identifiers",
    })
  })

  it("sends a replacement Mistral credential once and never redisplays it", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const credential = "mistral-secret-that-must-never-be-rendered"
    const response = await app.request("/status/control/external-ai/credential", {
      method: "POST",
      headers: origin({
        cookie: session,
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams({
        credential,
        reason: "Rotate the approved provider credential",
        password: "Initial password phrase1!",
      }),
    })
    expect(response.status).toBe(200)
    expect(controlPlane.replaceExternalAiCredential).toHaveBeenCalledWith({
      credential,
      reason: "Rotate the approved provider credential",
    })
    const body = await response.text()
    expect(body).toContain('name="credential" type="password"')
    expect(body).not.toContain(credential)
  })

  it("requires exact confirmation and a reason before removing the credential", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const headers = origin({
      cookie: session,
      "content-type": "application/x-www-form-urlencoded",
    })
    const refused = await app.request("/status/control/external-ai/credential/remove", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        confirmation: "REMOVE-SOMETHING-ELSE",
        reason: "Remove provider access from this hospital",
        password: "Initial password phrase1!",
      }),
    })
    expect(refused.status).toBe(400)
    expect(controlPlane.removeExternalAiCredential).not.toHaveBeenCalled()

    const accepted = await app.request("/status/control/external-ai/credential/remove", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        confirmation: "REMOVE-MISTRAL-CREDENTIAL",
        reason: "Remove provider access from this hospital",
        password: "Initial password phrase1!",
      }),
    })
    expect(accepted.status).toBe(200)
    expect(controlPlane.removeExternalAiCredential)
      .toHaveBeenCalledWith("Remove provider access from this hospital")
  })

  it.each([
    ["EXTERNAL_AI_SEAL_KEY_UNAVAILABLE", "en", "The appliance key needed to protect the Mistral credential is unavailable."],
    ["EXTERNAL_AI_PROVIDER_NOT_CONFIGURED", "bg", "Запазете валидни данни за достъп до Mistral"],
  ])("maps %s to a bilingual 409 without changing state", async (code, locale, message) => {
    const { app, auth, controlPlane } = setup()
    controlPlane.setExternalAiPolicy = vi.fn(async () => {
      throw new ControlPlaneClientError(code)
    })
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/external-ai/policy", {
      method: "POST",
      headers: origin({
        cookie: `${session}; lospor_status_locale=${locale}`,
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams({
        externalAiEnabled: "true",
        reason: "Approved hospital external AI policy",
        password: "Initial password phrase1!",
      }),
    })
    expect(response.status).toBe(409)
    expect(await response.text()).toContain(message)
  })
})
