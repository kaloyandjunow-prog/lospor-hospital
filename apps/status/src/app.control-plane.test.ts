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
  schemaVersion: 4,
  pediatricMode: {
    enabled: true,
    productionReady: false,
    releaseReviewed: true,
    rulesetVersion: "pediatric-v2",
    bundledRulesetVersion: "pediatric-v2",
    minimumClientVersion: "8.0.0",
    reviewedDoseProfilesRequired: true,
  },
  preoperative: {
    scope: "APPLIANCE_WIDE",
    catalogVersion: "1.4.7",
    source: "BUNDLED_IMMUTABLE_CATALOG",
    profileAdministrationPath: "/v1/preop/profile",
    administration: {
      catalog: [{
        stableKey: "BASE_ALLERGIES",
        catalogVersion: "1.4.7",
        section: "SAFETY",
        applicability: [],
        answerType: "CHOICE",
        labelEn: "Drug or other allergy",
        labelBg: "Алергия към лекарство или друго вещество",
        requiredDefault: false,
        allowUnknown: false,
        allowNotApplicable: false,
        conditionalRuleKey: null,
        omopDomain: "observation",
        omopConceptId: null,
        omopVocabulary: null,
        omopSourceCode: "LOSPOR:PREOP_BASE_ALLERGIES",
        options: [{ key: "YES", labelEn: "Yes", labelBg: "Да", omopConceptId: 4188539, omopVocabulary: "SNOMED", omopSourceCode: null }],
      }],
      activeProfile: {
        id: "profile-1",
        version: 4,
        catalogVersion: "1.4.7",
        status: "PUBLISHED",
        publishedAt: "2026-08-21T08:00:00.000Z",
        questions: [{ stableKey: "BASE_ALLERGIES", enabled: true, required: false, sortOrder: 0 }],
      },
    },
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
    advisorModel: "mistral-small-2603",
    visionModel: "mistral-large-2512",
    advisorModelOptions: ["mistral-small-2603", "mistral-large-2512"],
    visionModelOptions: ["mistral-large-2512", "ministral-14b-2512"],
    modelsChangedAt: null,
    updatedAt: "2026-08-22T08:00:00.000Z",
  },
  patientIdentifier: {
    egnPermitted: true,
    changeReasonRecorded: true,
    changedAt: "2026-08-19T08:00:00.000Z",
    updatedAt: "2026-08-19T08:00:00.000Z",
  },
  ehrTransport: {
    transport: "FOLDER",
    policyEnabled: true,
    credentialStored: false,
    providerConfigured: true,
    capability: "ENABLED",
    endpoint: null,
    authMode: "STATIC_BEARER",
    tokenUrl: null,
    clientId: null,
    scope: null,
    recordNumberSystem: null,
    recordNumberSystemChangedAt: null,
    nationalIdentifierSystem: null,
    nationalIdentifierSystemChangedAt: null,
    endpointChangedAt: null,
    credentialConfiguredAt: null,
    credentialChangedAt: null,
    transportChangedAt: "2026-08-18T08:00:00.000Z",
    updatedAt: "2026-08-18T08:00:00.000Z",
  },
  ehrLabCodes: {
    // One code waiting for an answer and one already answered, which is what
    // a site looks like partway through mapping.
    unmapped: [{
      system: "http://hospital.bg/labs",
      code: "ХГБ",
      reportedLabel: "Хемоглобин",
      seenCount: 12,
      lastSeenAt: "2026-09-03T07:30:00.000Z",
    }],
    mapped: [{
      system: "http://hospital.bg/labs",
      code: "HGB",
      test: "Haemoglobin (Hb)",
      reportedLabel: "Hemoglobin",
      assumedUnit: null,
      seenCount: 40,
      lastSeenAt: "2026-09-03T07:30:00.000Z",
      mappedAt: "2026-09-01T09:00:00.000Z",
    }],
    tests: [{ name: "Haemoglobin (Hb)", unit: "g/L", category: "Haematology" }],
  },
  ehrVitalCodes: {
    unmapped: [],
    mapped: [],
    fields: ["bpSystolic", "bpDiastolic", "heartRate", "spO2", "temperature", "respiratoryRate"],
  },
  ehrCodeSystems: {
    waiting: [{
      system: "http://vendor.bg/lists/proc",
      list: null,
      seenIn: ["procedures"],
      sampleCode: "30445-00",
      sampleLabel: "Лапароскопска холецистектомия",
      seenCount: 3,
      lastSeenAt: "2026-09-03T07:30:00.000Z",
      answeredAt: null,
    }],
    answered: [{
      system: "http://vendor.bg/lists/route",
      list: "NHIS_CL013",
      seenIn: ["routes"],
      sampleCode: "2",
      sampleLabel: "букално",
      seenCount: 5,
      lastSeenAt: "2026-09-03T07:30:00.000Z",
      answeredAt: "2026-09-02T09:00:00.000Z",
    }],
  },
}

const AMLODIPINE = {
  id: "drug-cl009:2208", catalogId: "cl009:2208", name: "Amlodipin Aurobindo",
  inn: "Amlodipine", atcCode: "C08CA01", form: "Tablet", strength: "5 mg", nhisCode: "2208",
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
    setExternalAiModels: vi.fn(async () => {}),
    setPatientIdentifierPolicy: vi.fn(async () => {}),
    setEhrTransportPolicy: vi.fn(async () => {}),
    setEhrStagingRetention: vi.fn(async () => {}),
    replaceEhrTransportCredential: vi.fn(async () => {}),
    removeEhrTransportCredential: vi.fn(async () => {}),
    mapEhrLabCode: vi.fn(async () => {}),
    unmapEhrLabCode: vi.fn(async () => {}),
    mapEhrVitalCode: vi.fn(async () => {}),
    unmapEhrVitalCode: vi.fn(async () => {}),
    mapEhrMedicationCode: vi.fn(async () => {}),
    unmapEhrMedicationCode: vi.fn(async () => {}),
    searchMedications: vi.fn(async (query: string) => query === "amlo" ? [AMLODIPINE] : []),
    answerEhrCodeSystem: vi.fn(async () => {}),
    updatePreopProfile: vi.fn(async () => {}),
    setEhrTransportEndpoint: vi.fn(async () => {}),
    setEhrIdentifierSystems: vi.fn(async () => {}),
    discoverEhrTransport: vi.fn(async () => ({
      capabilities: null, identifierSystems: [], patientFound: null, probeErrorCode: null,
    })),
    setEhrFolderRequests: vi.fn(async () => {}),
    checkEhrFile: vi.fn(async () => ({
      file: "checked.json", outcome: "would-import" as const, reason: null, identifierType: null, sourceMessageId: null,
      accepted: [], ignored: [], unknownKeys: [], labs: null,
    })),
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
    // Hospital controls is four tabs now (1.4.3), not one page, so the
    // surface this test covers is fetched from each address it actually
    // lives at. The secret-leak checks run against all four concatenated,
    // which is a stronger net than the single page they used to share.
    const { app, auth, controlPlane } = setup()
    const cookie = await passwordCookie(app, auth)
    // 1.5.4: seven pages under the skins. The legacy skin's four are fetched too:
    // both layouts must carry the whole surface.
    const fetchAll = (sections: string[], skin: string) => Promise.all(
      sections.map(async section => {
        const response = await app.request(`/status/control/${section}`, { headers: { cookie: `${cookie}; lospor_status_skin=${skin}` } })
        expect(response.status).toBe(200)
        return response.text()
      }),
    )
    const [clinical, ehr, codes, identity, research, central, ai] = await fetchAll(["clinical", "ehr", "codes", "identity", "research", "central", "ai"], "maphub")
    const legacy = (await fetchAll(["clinical", "ehr", "research", "ai"], "legacy")).join("")
    expect(legacy).toContain("Настройка за ЕГН")
    expect(legacy).toContain("Карта на лабораторните кодове")
    expect(legacy).toContain("Разрешения за изследвания")
    expect(identity).toContain("Настройка за ЕГН")
    expect(codes).toContain("Карта на лабораторните кодове")
    expect(central).toContain("Изпращане към Central (само изходящо)")
    const all = clinical + ehr + codes + identity + research + central + ai + legacy
    expect(all).toContain('<html lang="bg"')

    expect(research).toContain("Одобрение на конкретни OMOP набори")
    expect(research).toContain(HASH)
    expect(research).toContain("Активен профил, който може да получи разрешение")
    expect(research).toContain("началник на отделение")
    expect(research).not.toContain("HEAD_OF_DEPT")
    expect(central).toContain("Изключено по подразбиране")
    expect(central).toContain("https://central.example.test")
    expect(central).toContain("hospital-signing-key-1")
    expect(central).toContain("Клиентският сертификат е валиден от")
    expect(central).toContain("CA на Central е валиден до")
    expect(central).toContain("central-encryption-key-1")
    expect(central).toContain("Версии на манифеста, поддържани от Central")
    expect(central).toContain("67_108_864".replaceAll("_", ""))
    expect(central).toContain("4194304")
    expect(central).toContain("Опашки: Нов опит: 1")
    expect(central).toContain("#7 · Нов опит")
    expect(central).not.toContain('{&quot;RETRY&quot;')

    expect(ai).toContain("Външен ИИ (Mistral)")
    expect(ai).toContain("Данните за достъп са настроени на")
    expect(ai).toContain('name="credential" type="password"')

    expect(identity).toContain("Настройка за ЕГН")
    expect(identity).toContain("Разрешено свързване с национален идентификатор (ЕГН)")
    expect(ehr).toContain("Канал за импорт от БИС")
    expect(ehr).toContain("Наблюдаваната папка не изисква данни за достъп")

    expect(clinical).toContain("Документиране на педиатрични случаи")
    expect(clinical).toContain("постоянна функция на болничната версия")
    expect(clinical).toContain("pediatric-v2")
    expect(clinical).toContain("Готовност на базовата конфигурация")
    expect(clinical).toContain("Не е готово")
    expect(clinical).toContain("Не е избрана базова конфигурация за системата")
    expect(clinical).toContain("Политиката е включена")
    expect(clinical).toContain("Публикуван")
    expect(clinical).not.toContain("PUBLISHED")
    expect(clinical).toContain(ADULT_BASELINE_HASH)
    expect(clinical).toContain(PEDIATRIC_BASELINE_HASH)
    expect(clinical).toContain("data-preop-order-list")
    expect(clinical).toContain("data-preop-order-row")
    expect(clinical).toContain('draggable="true"')
    expect(clinical).toContain('data-move="up"')
    expect(clinical).toContain('data-move="down"')
    // Status sends script-src 'self': an inline <script> is blocked by the
    // browser, which left drag and the arrow buttons doing nothing.
    expect(clinical).toContain('<script src="/status/preop-order.js" defer></script>')
    expect(clinical).not.toMatch(/<script>\(\(\) =>/)
    const script = await app.request("/status/preop-order.js")
    expect(script.status).toBe(200)
    expect(script.headers.get("content-type")).toContain("text/javascript")
    expect(script.headers.get("content-security-policy")).toContain("script-src 'self'")
    expect(await script.text()).toContain("data-preop-order-list")

    expect(all).not.toContain("clientCertificatePem")
    expect(all).not.toContain("enrollmentToken")
    expect(all).not.toContain("patientName")
    expect(all).not.toContain("credentialCiphertext")
    expect(all).not.toContain("credentialAuthTag")
    expect(controlPlane.get).toHaveBeenCalledTimes(11) // one read per page: seven skin pages, four legacy
  })

  it("saves the complete preoperative profile only after password confirmation", async () => {
    const { app, auth, controlPlane } = setup()
    const cookie = await passwordCookie(app, auth)
    const base = {
      enabled_BASE_ALLERGIES: "true",
      order_BASE_ALLERGIES: "0",
      reason: "Enable the allergy question for the clinical intake",
    }
    const refused = await app.request("/status/control/preop-profile", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ ...base, password: "Wrong password" }),
    })
    expect(refused.status).toBe(401)
    expect(controlPlane.updatePreopProfile).not.toHaveBeenCalled()

    const accepted = await app.request("/status/control/preop-profile", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ ...base, password: "Initial password phrase1!" }),
    })
    expect(accepted.status).toBe(200)
    expect(controlPlane.updatePreopProfile).toHaveBeenCalledWith({
      reason: base.reason,
      questions: [{ stableKey: "BASE_ALLERGIES", enabled: true, required: false, sortOrder: 0 }],
    })
    expect(await accepted.text()).not.toContain("Initial password phrase1!")
  })

  it("drops Required when the operator unticks Enabled, instead of refusing the save", async () => {
    const { app, auth, controlPlane } = setup()
    const cookie = await passwordCookie(app, auth)
    const response = await app.request("/status/control/preop-profile", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({
        required_BASE_ALLERGIES: "true",
        order_BASE_ALLERGIES: "0",
        reason: "Stop asking the allergy question for now",
        password: "Initial password phrase1!",
      }),
    })
    expect(response.status).toBe(200)
    expect(controlPlane.updatePreopProfile).toHaveBeenCalledWith({
      reason: "Stop asking the allergy question for now",
      questions: [{ stableKey: "BASE_ALLERGIES", enabled: false, required: false, sortOrder: 0 }],
    })
  })

  it("renders every bundled question in active-profile order with drag and keyboard controls", async () => {
    const { app, auth, controlPlane } = setup()
    const view = structuredClone(VIEW)
    const base = view.preoperative.administration!.catalog[0]!
    const middle = { ...base, stableKey: "A1_RECENT_INFECTION", labelEn: "Recent infection", labelBg: "Recent infection" }
    const last = { ...base, stableKey: "P1_PREMATURITY_NICU", labelEn: "Prematurity or NICU admission", labelBg: "Prematurity or NICU admission" }
    view.preoperative.administration = {
      catalog: [base, middle, last],
      activeProfile: {
        id: "profile-2",
        version: 5,
        catalogVersion: "1.4.7",
        status: "PUBLISHED",
        publishedAt: "2026-08-22T08:00:00.000Z",
        questions: [
          { stableKey: last.stableKey, enabled: true, required: false, sortOrder: 0 },
          { stableKey: base.stableKey, enabled: true, required: true, sortOrder: 1 },
          { stableKey: middle.stableKey, enabled: false, required: false, sortOrder: 2 },
        ],
      },
    }
    vi.spyOn(controlPlane, "get").mockResolvedValue(view)
    const cookie = await passwordCookie(app, auth)
    const response = await app.request("/status/control/clinical", { headers: { cookie } })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect((html.match(/<li class="preop-order-row"/g) ?? []).length).toBe(3)
    expect(html.indexOf("data-stable-key=\"" + last.stableKey + "\"")).toBeLessThan(html.indexOf("data-stable-key=\"" + base.stableKey + "\""))
    expect(html.indexOf("data-stable-key=\"" + base.stableKey + "\"")).toBeLessThan(html.indexOf("data-stable-key=\"" + middle.stableKey + "\""))
    expect(html).toContain("type=\"checkbox\" name=\"required_" + middle.stableKey + "\"")
    expect(html).toContain("type=\"checkbox\" name=\"required_" + middle.stableKey + "\" value=\"true\"  disabled")
    expect(html).toContain("name=\"order_" + last.stableKey + "\"")
    expect(html).toContain("data-move=\"up\"")
    expect(html).toContain("data-move=\"down\"")
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
    const cookie = { cookie: `${session}; lospor_status_locale=en` }
    const research = await (await app.request("/status/control/research", { headers: cookie })).text()
      + await (await app.request("/status/control/central", { headers: cookie })).text()
    const clinical = await (await app.request("/status/control/clinical", { headers: cookie })).text()
    const ai = await (await app.request("/status/control/ai", { headers: cookie })).text()
    expect(research + clinical + ai).toContain('<html lang="en"')
    expect(research).toContain("Exact OMOP approvals")
    expect(research).toContain("Central automatic clinical delivery")
    expect(research).toContain("every eligible finalized case is queued automatically")
    expect(research).toContain("clinicians do not approve cases one by one")
    expect(clinical).toContain("Prospective calculation guidance")
    expect(clinical).toContain("Pediatric charting")
    expect(clinical).toContain("fixed Hospital capability")
    expect(clinical).toContain("Baseline readiness")
    expect(clinical).toContain("Not ready")
    expect(clinical).toContain("No platform baseline is selected")
    expect(clinical).toContain("Policy enabled")
    expect(ai).toContain("External AI (Mistral)")
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

  it("chooses an EHR import transport, treating an empty selection as disabled rather than a fourth enum value", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const headers = origin({
      cookie: `${session}; lospor_status_locale=en`,
      "content-type": "application/x-www-form-urlencoded",
    })
    const disabled = await app.request("/status/control/ehr-transport/policy", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        transport: "",
        reason: "No hospital system is ready to send EHR values yet",
        password: "Initial password phrase1!",
      }),
    })
    expect(disabled.status).toBe(200)
    expect(controlPlane.setEhrTransportPolicy).toHaveBeenCalledWith({
      transport: null,
      reason: "No hospital system is ready to send EHR values yet",
    })

    const folder = await app.request("/status/control/ehr-transport/policy", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        transport: "FOLDER",
        reason: "Air-gapped site uses a watched directory",
        password: "Initial password phrase1!",
      }),
    })
    expect(folder.status).toBe(200)
    expect(controlPlane.setEhrTransportPolicy).toHaveBeenCalledWith({
      transport: "FOLDER",
      reason: "Air-gapped site uses a watched directory",
    })

    const invalid = await app.request("/status/control/ehr-transport/policy", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        transport: "SOMETHING-ELSE",
        reason: "Not a real transport",
        password: "Initial password phrase1!",
      }),
    })
    expect(invalid.status).toBe(400)
  })

  it("shortens how long staged EHR data is kept, and never past 14 days", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const headers = origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" })
    const page = await (await app.request("/status/control/ehr", { headers: origin({ cookie: session }) })).text()
    expect(page).toContain('action="/status/control/ehr-transport/retention"')
    const saved = await app.request("/status/control/ehr-transport/retention", {
      method: "POST",
      headers,
      body: new URLSearchParams({ days: "7", reason: "Clinicians review imports within a week", password: "Initial password phrase1!" }),
    })
    expect(saved.status).toBe(200)
    expect(controlPlane.setEhrStagingRetention).toHaveBeenCalledWith({ days: 7, reason: "Clinicians review imports within a week" })
    for (const days of ["30", "0", "seven"]) {
      const refused = await app.request("/status/control/ehr-transport/retention", {
        method: "POST",
        headers,
        body: new URLSearchParams({ days, reason: "Trying an out of range value", password: "Initial password phrase1!" }),
      })
      expect(refused.status).toBe(400)
    }
    expect(controlPlane.setEhrStagingRetention).toHaveBeenCalledTimes(1)
  })

  it("sends a replacement EHR transport credential once and never redisplays it, then removes it only with exact confirmation", async () => {
    const { app, auth, controlPlane } = setup()
    // A FOLDER transport has no credential form at all, so this has to run
    // against FHIR to exercise the EHR tab's own form -- the FOLDER-default
    // fixture only ever passed this check by coincidence, via the identical
    // name="credential" input on the unrelated External AI tab.
    vi.mocked(controlPlane.get).mockResolvedValue({
      ...VIEW,
      ehrTransport: { ...VIEW.ehrTransport, transport: "FHIR" as const },
    })
    const session = await passwordCookie(app, auth)
    const headers = origin({
      cookie: session,
      "content-type": "application/x-www-form-urlencoded",
    })
    const credential = "fhir-endpoint-secret-that-must-never-be-rendered"
    const replaced = await app.request("/status/control/ehr-transport/credential", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        credential,
        reason: "Configure the approved FHIR endpoint credential",
        password: "Initial password phrase1!",
      }),
    })
    expect(replaced.status).toBe(200)
    expect(controlPlane.replaceEhrTransportCredential).toHaveBeenCalledWith({
      credential,
      reason: "Configure the approved FHIR endpoint credential",
    })
    const body = await replaced.text()
    expect(body).toContain('action="/status/control/ehr-transport/credential"')
    expect(body).toContain('name="credential" type="password"')
    expect(body).not.toContain(credential)

    const refusedRemoval = await app.request("/status/control/ehr-transport/credential/remove", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        confirmation: "REMOVE-SOMETHING-ELSE",
        reason: "Remove the retired endpoint credential",
        password: "Initial password phrase1!",
      }),
    })
    expect(refusedRemoval.status).toBe(400)
    expect(controlPlane.removeEhrTransportCredential).not.toHaveBeenCalled()

    const removed = await app.request("/status/control/ehr-transport/credential/remove", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        confirmation: "REMOVE-EHR-TRANSPORT-CREDENTIAL",
        reason: "Remove the retired endpoint credential",
        password: "Initial password phrase1!",
      }),
    })
    expect(removed.status).toBe(200)
    expect(controlPlane.removeEhrTransportCredential)
      .toHaveBeenCalledWith("Remove the retired endpoint credential")
  })

  it("maps a credential attempt on a non-credentialed transport to a bilingual conflict", async () => {
    const { app, auth, controlPlane } = setup()
    controlPlane.replaceEhrTransportCredential = vi.fn(async () => {
      throw new ControlPlaneClientError("EHR_TRANSPORT_NOT_CREDENTIALED")
    })
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/ehr-transport/credential", {
      method: "POST",
      headers: origin({
        cookie: `${session}; lospor_status_locale=bg`,
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams({
        credential: "must-not-be-consumed",
        reason: "Attempted credential on a FOLDER site",
        password: "Initial password phrase1!",
      }),
    })
    expect(response.status).toBe(409)
    expect(await response.text()).toContain("Изберете FHIR или HL7v2 като канал")
  })

  it("chooses the external-AI models from the offered list", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const headers = origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" })
    const page = await (await app.request("/status/control/ai", { headers: origin({ cookie: session }) })).text()
    expect(page).toContain('action="/status/control/external-ai/models"')
    expect(page).toContain('<option value="mistral-small-2603" selected>')
    expect(page).toContain('<option value="ministral-14b-2512" >')
    const saved = await app.request("/status/control/external-ai/models", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        advisorModel: "mistral-large-2512",
        visionModel: "ministral-14b-2512",
        reason: "Mistral retired the previous model",
        password: "Initial password phrase1!",
      }),
    })
    expect(saved.status).toBe(200)
    expect(controlPlane.setExternalAiModels).toHaveBeenCalledWith({
      advisorModel: "mistral-large-2512",
      visionModel: "ministral-14b-2512",
      reason: "Mistral retired the previous model",
    })
    const refused = await app.request("/status/control/external-ai/models", {
      method: "POST",
      headers,
      body: new URLSearchParams({
        advisorModel: "<script>",
        visionModel: "mistral-large-2512",
        reason: "Not a model name at all",
        password: "Initial password phrase1!",
      }),
    })
    expect(refused.status).toBe(400)
    expect(controlPlane.setExternalAiModels).toHaveBeenCalledTimes(1)
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

describe("code-list addresses", () => {
  it("answers an address without a password, and shows what is waiting", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const page = await app.request("/status/control/codes", { headers: { cookie: `${session}; lospor_status_locale=en` } })
    const html = await page.text()
    expect(html).toContain("http://vendor.bg/lists/proc")
    expect(html).toContain("Лапароскопска холецистектомия")
    expect(html).toContain("Routes: NHIS CL013 (EDQM)")

    const response = await app.request("/status/control/ehr-code-systems/answer", {
      method: "POST",
      headers: origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ system: "http://vendor.bg/lists/proc", list: "KSMP" }),
    })
    expect(response.status).toBe(200)
    expect(controlPlane.answerEhrCodeSystem).toHaveBeenCalledWith({ system: "http://vendor.bg/lists/proc", list: "KSMP" })
  })

  it("takes an answer back with a blank list", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    await app.request("/status/control/ehr-code-systems/answer", {
      method: "POST",
      headers: origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ system: "http://vendor.bg/lists/route", list: "" }),
    })
    expect(controlPlane.answerEhrCodeSystem).toHaveBeenCalledWith({ system: "http://vendor.bg/lists/route", list: null })
  })

  it("refuses a list that does not exist", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/ehr-code-systems/answer", {
      method: "POST",
      headers: origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ system: "http://vendor.bg/lists/proc", list: "SNOMED" }),
    })
    expect(response.status).toBe(400)
    expect(controlPlane.answerEhrCodeSystem).not.toHaveBeenCalled()
  })

  it("still refuses a cross-origin post", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/ehr-code-systems/answer", {
      method: "POST",
      headers: { cookie: session, origin: "https://elsewhere.example", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ system: "http://vendor.bg/lists/proc", list: "KSMP" }),
    })
    expect(response.status).toBe(403)
    expect(controlPlane.answerEhrCodeSystem).not.toHaveBeenCalled()
  })
})

describe("the laboratory code map", () => {
  it("maps a code without asking for a password, and audits it", async () => {
    // Deliberately unlike the policies beside it. An operator answers dozens of
    // these in a sitting; a password per row leaves a site half-mapped, which
    // is worse than the risk, because a wrong mapping shows on the review
    // screen and is undone in a click.
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/ehr-lab-codes/map", {
      method: "POST",
      headers: origin({
        cookie: `${session}; lospor_status_locale=en`,
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams({
        system: "http://hospital.bg/labs",
        code: "ХГБ",
        test: "Haemoglobin (Hb)",
        assumedUnit: "",
      }),
    })

    expect(response.status).toBe(200)
    expect(controlPlane.mapEhrLabCode).toHaveBeenCalledWith({
      system: "http://hospital.bg/labs",
      code: "ХГБ",
      test: "Haemoglobin (Hb)",
      // Blank means "read the unit from each result", which is the ordinary
      // case; only a feed that sends no units at all fills this in.
      assumedUnit: null,
    })
  })

  it("carries an assumed unit through when a site states one", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    await app.request("/status/control/ehr-lab-codes/map", {
      method: "POST",
      headers: origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ system: "", code: "HGB", test: "Haemoglobin (Hb)", assumedUnit: "g/dL" }),
    })

    expect(controlPlane.mapEhrLabCode).toHaveBeenCalledWith({
      system: "", code: "HGB", test: "Haemoglobin (Hb)", assumedUnit: "g/dL",
    })
  })

  it("unmaps a code", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/ehr-lab-codes/unmap", {
      method: "POST",
      headers: origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ system: "http://hospital.bg/labs", code: "ХГБ" }),
    })

    expect(response.status).toBe(200)
    expect(controlPlane.unmapEhrLabCode).toHaveBeenCalledWith({
      system: "http://hospital.bg/labs", code: "ХГБ",
    })
  })

  it("still refuses a cross-origin post", async () => {
    // Dropping the password prompt drops nothing else. Same origin, a real
    // password session and a bounded body all still apply.
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/ehr-lab-codes/map", {
      method: "POST",
      headers: {
        cookie: session,
        origin: "https://elsewhere.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ system: "", code: "HGB", test: "Haemoglobin (Hb)" }),
    })

    expect(response.status).toBe(403)
    expect(controlPlane.mapEhrLabCode).not.toHaveBeenCalled()
  })

  it("still refuses without a password session", async () => {
    const { app, controlPlane } = setup()
    const response = await app.request("/status/control/ehr-lab-codes/map", {
      method: "POST",
      headers: origin({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ system: "", code: "HGB", test: "Haemoglobin (Hb)" }),
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("password")
    expect(controlPlane.mapEhrLabCode).not.toHaveBeenCalled()
  })
})

/**
 * The medication code map (1.4.16). The dropdown used to hold the first 500
 * Drug rows alphabetically, and nothing on a site that never ran the
 * terminology import, so a code could not be mapped to most drugs. Each code
 * now searches the whole medication list and maps to a list product.
 */
describe("the medication code map", () => {
  const withMedicationCode = (controlPlane: ControlPlanePort) => {
    vi.mocked(controlPlane.get).mockResolvedValue({
      ...VIEW,
      ehrMedicationCodes: {
        unmapped: [{
          system: "urn:bg:his:products", code: "994", reportedLabel: "Амлодипин 5",
          seenCount: 2, lastSeenAt: "2026-09-27T08:00:00.000Z", mappedAt: null,
          candidates: [{ ...AMLODIPINE, id: "drug-cl009:111", catalogId: "cl009:111", name: "Norvasc" }],
        }],
        mapped: [],
        drugs: [],
      },
    })
  }

  it("searches the list for one code and offers what it found, before the suggestions", async () => {
    const { app, auth, controlPlane } = setup()
    withMedicationCode(controlPlane)
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/codes?medicationSystem=urn%3Abg%3Ahis%3Aproducts&medicationCode=994&medicationSearch=amlo", {
      headers: { cookie: `${session}; lospor_status_locale=en` },
    })

    const html = await response.text()
    expect(controlPlane.searchMedications).toHaveBeenCalledWith("amlo")
    expect(html).toContain("1 found for “amlo”")
    expect(html).toContain("name='medicationSearch' minlength='2' maxlength='100' required value='amlo'")
    const select = html.slice(html.indexOf("name='catalogId'"))
    expect(select.indexOf("value='cl009:2208'")).toBeGreaterThan(0)
    expect(select.indexOf("value='cl009:2208'")).toBeLessThan(select.indexOf("value='cl009:111'"))
  })

  it("does not search for another code's form, or for one letter", async () => {
    const { app, auth, controlPlane } = setup()
    withMedicationCode(controlPlane)
    const session = await passwordCookie(app, auth)
    await app.request("/status/control/codes?medicationCode=994&medicationSearch=a", { headers: { cookie: session } })
    expect(controlPlane.searchMedications).not.toHaveBeenCalled()
    const html = await (await app.request("/status/control/codes?medicationCode=995&medicationSearch=amlo", { headers: { cookie: session } })).text()
    expect(html).not.toContain("value='cl009:2208'")
  })

  it("says so when the search fails, instead of showing no results", async () => {
    const { app, auth, controlPlane } = setup()
    withMedicationCode(controlPlane)
    vi.mocked(controlPlane.searchMedications).mockRejectedValue(new Error("down"))
    const session = await passwordCookie(app, auth)
    const query = "medicationSystem=urn%3Abg%3Ahis%3Aproducts&medicationCode=994&medicationSearch=amlo"
    const html = await (await app.request(`/status/control/codes?${query}`, {
      headers: { cookie: `${session}; lospor_status_locale=en` },
    })).text()
    expect(html).toContain("The search could not reach the hospital system.")
    // The legacy skin keeps the medication map, and its search, on the EHR page.
    const legacy = await (await app.request(`/status/control/ehr?${query}`, {
      headers: { cookie: `${session}; lospor_status_locale=en; lospor_status_skin=legacy` },
    })).text()
    expect(legacy).toContain("The search could not reach the hospital system.")
    expect(legacy).toContain("action='/status/control/ehr#medication-code-")
  })

  it("maps a code to a list product without a password", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    const response = await app.request("/status/control/ehr-medication-codes/map", {
      method: "POST",
      headers: origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ system: "urn:bg:his:products", code: "994", catalogId: "cl009:2208" }),
    })

    expect(response.status).toBe(200)
    expect(controlPlane.mapEhrMedicationCode).toHaveBeenCalledWith({
      system: "urn:bg:his:products", code: "994", catalogId: "cl009:2208",
    })
  })

  it("refuses anything that is not a list product", async () => {
    const { app, auth, controlPlane } = setup()
    const session = await passwordCookie(app, auth)
    for (const catalogId of ["drug-amlodipine", "cl009:22 08", "atc:C08CA01"]) {
      await app.request("/status/control/ehr-medication-codes/map", {
        method: "POST",
        headers: origin({ cookie: session, "content-type": "application/x-www-form-urlencoded" }),
        body: new URLSearchParams({ system: "", code: "994", catalogId }),
      })
    }
    expect(controlPlane.mapEhrMedicationCode).not.toHaveBeenCalled()
  })
})

/**
 * The integration screen, which until now did not exist.
 *
 * The endpoint route has been in the API since the transport was built and
 * nothing in Status ever called it, so a site could choose FHIR and store a
 * credential and then had nowhere to say where to send. That is also why the
 * policy could report itself ready with no endpoint: it was the only
 * reachable state.
 */
describe("configuring the EHR integration", () => {
  const fhirView = () => ({
    ...VIEW,
    ehrTransport: {
      ...VIEW.ehrTransport,
      transport: "FHIR" as const,
      endpoint: "https://fhir.hospital.example/r4",
      recordNumberSystem: null,
      nationalIdentifierSystem: null,
    },
  })

  it("offers the endpoint and both numberings once FHIR is chosen", async () => {
    const { app, auth, controlPlane } = setup()
    vi.mocked(controlPlane.get).mockResolvedValue(fhirView())
    const cookie = await passwordCookie(app, auth)
    const body = await (await app.request("/status/control/ehr", { headers: { cookie } })).text()

    expect(body).toContain("/status/control/ehr-transport/endpoint")
    expect(body).toContain("/status/control/ehr-transport/identifier-systems")
    expect(body).toContain("/status/control/ehr-transport/discover")
    // The address already configured is shown, not hidden: the first question
    // anyone reviewing an integration asks is where it sends.
    expect(body).toContain("https://fhir.hospital.example/r4")
  })

  // 1.5.0: what "Ask the server" returned is offered as a choice in both
  // fields, instead of a sentence the operator had to copy from by hand.
  it("offers the numberings the server returned in both fields", async () => {
    const { app, auth, controlPlane } = setup()
    vi.mocked(controlPlane.get).mockResolvedValue(fhirView())
    vi.mocked(controlPlane.discoverEhrTransport).mockResolvedValue({
      capabilities: null, patientFound: true, probeErrorCode: null,
      identifierSystems: ["urn:oid:1.2.3.4", "https://demo-bis.bg/fhir/sid/egn"],
    })
    const cookie = await passwordCookie(app, auth)

    const body = await (await app.request("/status/control/ehr-transport/discover", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ identifier: "71005", password: "Initial password phrase1!" }).toString(),
    })).text()

    expect(body).toContain("<datalist id=\"ehr-numberings\"><option value=\"urn:oid:1.2.3.4\"><option value=\"https://demo-bis.bg/fhir/sid/egn\"></datalist>")
    expect(body).toMatch(/name="recordNumberSystem" list="ehr-numberings"/)
    expect(body).toMatch(/name="nationalIdentifierSystem" list="ehr-numberings"/)
  })

  it("offers no list before the server has been asked", async () => {
    const { app, auth, controlPlane } = setup()
    vi.mocked(controlPlane.get).mockResolvedValue(fhirView())
    const cookie = await passwordCookie(app, auth)
    const body = await (await app.request("/status/control/ehr", { headers: { cookie } })).text()

    expect(body).not.toContain("ehr-numberings")
  })

  // A folder-drop site has no endpoint, no credential and no namespaces to
  // configure; showing the forms would be offering settings that do nothing.
  it("shows none of it for a watched folder", async () => {
    const { app, auth } = setup()
    const cookie = await passwordCookie(app, auth)
    const body = await (await app.request("/status/control/ehr", { headers: { cookie } })).text()

    expect(body).not.toContain("/status/control/ehr-transport/identifier-systems")
  })

  it("saves an endpoint through the private API", async () => {
    const { app, auth, controlPlane } = setup()
    vi.mocked(controlPlane.get).mockResolvedValue(fhirView())
    const cookie = await passwordCookie(app, auth)

    await app.request("/status/control/ehr-transport/endpoint", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({
        endpoint: "https://fhir.hospital.example/r4",
        authMode: "OAUTH2_CLIENT_CREDENTIALS",
        tokenUrl: "https://auth.hospital.example/token",
        clientId: "lospor",
        scope: "system/Patient.read",
        reason: "Configuring the hospital integration endpoint",
        password: "Initial password phrase1!",
      }).toString(),
    })

    expect(vi.mocked(controlPlane.setEhrTransportEndpoint)).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://fhir.hospital.example/r4", authMode: "OAUTH2_CLIENT_CREDENTIALS" }),
    )
  })

  /**
   * Clearing a numbering returns matches to unverified, so it is its own
   * deliberate act rather than something that happens by leaving a field
   * blank -- which is what an operator setting only the other one does.
   */
  it("distinguishes leaving a numbering alone from clearing it", async () => {
    const { app, auth, controlPlane } = setup()
    vi.mocked(controlPlane.get).mockResolvedValue(fhirView())
    const cookie = await passwordCookie(app, auth)

    await app.request("/status/control/ehr-transport/identifier-systems", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({
        recordNumberSystem: "http://hospital.bg/iz",
        nationalIdentifierSystem: "",
        reason: "Recording the admission numbering after checking a real record",
        password: "Initial password phrase1!",
      }).toString(),
    })

    const call = vi.mocked(controlPlane.setEhrIdentifierSystems).mock.calls[0]?.[0]
    expect(call).toMatchObject({ recordNumberSystem: "http://hospital.bg/iz" })
    expect(call).not.toHaveProperty("nationalIdentifierSystem")
  })
})

describe("the watched folder (1.5.0)", () => {
  const health = {
    waiting: 2,
    oldestWaitingSeconds: 900,
    lastReadAt: "2026-10-04T09:00:00.000Z",
    last24h: { imported: 14, rejected: 1 },
    recentRejections: [{ file: "adm-77.json", reason: "unknown-identifier-type" as const, at: "2026-10-04T08:59:00.000Z" }],
  }
  const check = {
    file: "sample.json", outcome: "would-import" as const, reason: null, identifierType: "IZ" as const, sourceMessageId: "HIS-1",
    accepted: ["weightKg", "labResults"], ignored: [{ field: "clinicalMode", reason: "not-importable" }], unknownKeys: ["patientNmae"],
    labs: { received: 3, undated: 1, unmappedCodes: [{ system: "", code: "ХГБ-местен", display: "ХГБ-местен" }] },
  }
  const upload = (cookie: string, content = '{"identifier":"42"}', headers: Record<string, string> = {}) => {
    const form = new FormData()
    form.set("file", new File([content], "sample.json", { type: "application/json" }))
    return app.request("/status/control/ehr-transport/check-file", { method: "POST", headers: origin({ cookie, ...headers }), body: form })
  }
  let app: ReturnType<typeof setup>["app"]

  it("shows how the folder is doing, with each refusal in the operator's words", async () => {
    const setupResult = setup()
    app = setupResult.app
    vi.mocked(setupResult.controlPlane.get).mockResolvedValue({ ...VIEW, ehrFolder: health } as never)
    const cookie = await passwordCookie(app, setupResult.auth)
    const body = await (await app.request("/status/control/ehr", { headers: { cookie } })).text()

    expect(body).toContain("<b>Файлове, чакащи прочитане</b>2")
    expect(body).toContain("14 приети за преглед, 1 отказани")
    expect(body).toContain("<code>adm-77.json</code> — identifierType не е нито IZ, нито EGN")
    expect(body).toContain("Файл чака повече от десет минути")
    expect(body).toContain('action="/status/control/ehr-transport/check-file" enctype="multipart/form-data"')
  })

  it("offers no folder card on a FHIR site", async () => {
    const setupResult = setup()
    vi.mocked(setupResult.controlPlane.get).mockResolvedValue({ ...VIEW, ehrTransport: { ...VIEW.ehrTransport, transport: "FHIR" }, ehrFolder: null } as never)
    const cookie = await passwordCookie(setupResult.app, setupResult.auth)
    const body = await (await setupResult.app.request("/status/control/ehr", { headers: { cookie } })).text()
    expect(body).not.toContain("/status/control/ehr-transport/check-file")
  })

  it("checks an uploaded file through the API and shows what the inbox would do", async () => {
    const setupResult = setup()
    app = setupResult.app
    vi.mocked(setupResult.controlPlane.checkEhrFile).mockResolvedValue(check)
    const cookie = await passwordCookie(app, setupResult.auth)
    const response = await upload(cookie)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(setupResult.controlPlane.checkEhrFile).toHaveBeenCalledWith({ content: '{"identifier":"42"}', file: "sample.json" })
    expect(body).toContain("Този файл ще бъде приет за преглед от лекар.")
    expect(body).toContain("<code>weightKg</code>, <code>labResults</code>")
    expect(body).toContain("<code>clinicalMode</code> — поле, което форматът не приема")
    expect(body).toContain("<code>patientNmae</code>")
    expect(body).toContain("ХГБ-местен")
  })

  it("says why a file would be refused", async () => {
    const setupResult = setup()
    app = setupResult.app
    vi.mocked(setupResult.controlPlane.checkEhrFile).mockResolvedValue({ ...check, outcome: "rejected", reason: "no-identifier", accepted: [] })
    const cookie = await passwordCookie(app, setupResult.auth)
    expect(await (await upload(cookie)).text()).toContain("Този файл ще бъде отказан: няма идентификатор на пациента.")
  })

  it("checks nothing for another origin, a recovery session, an empty file or one over a megabyte", async () => {
    const setupResult = setup()
    app = setupResult.app
    const cookie = await passwordCookie(app, setupResult.auth)
    const form = new FormData()
    form.set("file", new File(["{}"], "a.json"))
    expect((await app.request("/status/control/ehr-transport/check-file", { method: "POST", headers: { cookie, origin: "https://evil.example" }, body: form })).status).toBe(403)
    expect((await upload(await recoveryCookie(app, setupResult.auth))).status).toBe(403)
    expect((await upload(cookie, "   ")).status).toBe(400)
    expect((await upload(cookie, "x".repeat(1024 * 1024 + 1))).status).toBe(413)
    expect(setupResult.controlPlane.checkEhrFile).not.toHaveBeenCalled()
  })
})

describe("asking the hospital system over the folder (1.5.0)", () => {
  it("shows the switch off by default, and switches it on with a reason and the password", async () => {
    const { app, auth, controlPlane } = setup()
    const cookie = await passwordCookie(app, auth)
    const page = await (await app.request("/status/control/ehr", { headers: { cookie } })).text()
    expect(page).toContain("<b>Заявки</b>изключени")
    expect(page).toContain('<input type="hidden" name="enabled" value="true">')

    const response = await app.request("/status/control/ehr-transport/folder-requests", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ enabled: "true", reason: "Vendor answers request files", password: "Initial password phrase1!" }).toString(),
    })
    expect(response.status).toBe(200)
    expect(controlPlane.setEhrFolderRequests).toHaveBeenCalledWith({ enabled: true, reason: "Vendor answers request files" })
  })

  it("offers to stop once it is on", async () => {
    const { app, auth, controlPlane } = setup()
    vi.mocked(controlPlane.get).mockResolvedValue({ ...VIEW, ehrTransport: { ...VIEW.ehrTransport, folderRequestsEnabled: true } } as never)
    const cookie = await passwordCookie(app, auth)
    const page = await (await app.request("/status/control/ehr", { headers: { cookie } })).text()
    expect(page).toContain("<b>Заявки</b>включени")
    expect(page).toContain('<input type="hidden" name="enabled" value="false">')
  })

  it("changes nothing without the password", async () => {
    const { app, auth, controlPlane } = setup()
    const cookie = await passwordCookie(app, auth)
    await app.request("/status/control/ehr-transport/folder-requests", {
      method: "POST",
      headers: origin({ cookie, "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ enabled: "true", reason: "Vendor answers request files", password: "wrong" }).toString(),
    })
    expect(controlPlane.setEhrFolderRequests).not.toHaveBeenCalled()
  })
})
