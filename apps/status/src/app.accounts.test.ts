import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthService } from "./auth.js"
import { createStatusApp } from "./app.js"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import type { AccountControlPort, AccountCreateRequest } from "./account-control.js"
import { totpCode } from "./mfa.js"

const NOW = Date.parse("2026-08-22T12:00:00.000Z")
const SECRET = "https://clinical.hospital.test/reset-password#hospitalToken=" + "A".repeat(43)
const LINK = {
  purpose: "ACTIVATION" as const,
  url: SECRET,
  expiresAt: "2026-08-25T12:00:00.000Z",
}
const DIRECTORY = {
  institutions: [{
    id: "inst-1",
    name: "УМБАЛ Тест",
    city: "София",
    canHaveHeadOfDepartment: true,
  }],
  accounts: [{
    id: "user-1",
    username: "Dr.Iva",
    email: "doctor@example.test",
    name: "д-р Ива Петрова",
    role: "MEMBER",
    accountKind: "CLINICAL" as const,
    locale: "bg" as const,
    institutionId: "inst-1",
    institutionName: "УМБАЛ Тест",
    state: "PENDING_ACTIVATION" as const,
    designatedApplianceOperator: false,
    activeActivationExpiresAt: LINK.expiresAt,
    activeRecoveryExpiresAt: null,
    createdAt: "2026-08-22T12:00:00.000Z",
  }, {
    id: "admin-1",
    username: "Clinical.Admin",
    email: "clinical-admin@example.test",
    name: "Clinical administrator",
    role: "ADMIN",
    accountKind: "CLINICAL" as const,
    locale: "en" as const,
    institutionId: "inst-1",
    institutionName: "УМБАЛ Тест",
    state: "ACTIVE" as const,
    designatedApplianceOperator: false,
    activeActivationExpiresAt: null,
    activeRecoveryExpiresAt: null,
    createdAt: "2026-08-20T12:00:00.000Z",
  }],
}

const databases: StatusDatabase[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
})

function setup() {
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  const auth = new AuthService(db, Buffer.alloc(32, 9), 4, () => NOW)
  const accountControl: AccountControlPort = {
    list: vi.fn(async () => DIRECTORY),
    create: vi.fn(async (input: AccountCreateRequest) => ({
      account: {
        id: "user-2",
        username: input.username,
        email: input.email,
        name: `${input.title} ${input.firstName} ${input.lastName}`.trim(),
        role: "MEMBER",
        accountKind: "CLINICAL" as const,
        institutionId: input.institutionId,
        institutionName: "УМБАЛ Тест",
      },
      oneTimeLink: LINK,
    })),
    reissueActivation: vi.fn(async () => LINK),
    issueRecovery: vi.fn(async () => ({
      purpose: "RECOVERY" as const,
      url: SECRET.replace("A".repeat(43), "R".repeat(43)),
      expiresAt: "2026-08-22T20:00:00.000Z",
    })),
    changeRole: vi.fn(async (userId, role) => ({
      account: { id: userId, role },
      previousRole: "MEMBER" as const,
      changed: true,
      invalidatedLinks: 0,
    })),
    changeUsername: vi.fn(async (userId, username) => ({
      account: { id: userId, username },
      oneTimeLink: {
        purpose: "RECOVERY" as const,
        url: SECRET.replace("A".repeat(43), "U".repeat(43)),
        expiresAt: "2026-08-22T20:00:00.000Z",
      },
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
    db,
    auth,
    accountControl,
    app: createStatusApp({ db, auth, config, accountControl, now: () => NOW }),
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

describe("Status account workflows", () => {
  it("renders a Bulgarian account directory with only the three permitted profiles", async () => {
    const { app, auth, accountControl } = setup()
    const cookie = await passwordCookie(app, auth)
    const response = await app.request("/status/accounts", { headers: { cookie } })
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).toContain('<html lang="bg">')
    expect(body).toContain("Създаване на профил")
    expect(body).toContain('value="CLINICAL_MEMBER"')
    expect(body).toContain('value="CLINICAL_HOD"')
    expect(body).toContain('value="RESEARCH_ONLY"')
    expect(body).not.toContain('value="ADMIN"')
    expect(body).toContain('pattern="[A-Za-z][A-Za-z0-9._-]{2,63}"')
    expect(body).toContain("Главните и малките букви са разрешени и се запазват")
    expect(body).toContain("никога не се използва за вход")
    expect(body).toContain("@Dr.Iva")
    expect(body).toContain("clinical-admin@example.test")
    expect(body).not.toContain("/status/accounts/admin-1/recovery")
    expect(body).toContain("сама по себе си не дава достъп до клинични записи")
    expect(body).toContain("Няма нива на права")
    expect(accountControl.list).toHaveBeenCalledTimes(1)
  })

  it.each([
    "ab",
    "1Doctor",
    "Doctor Name",
    "Doctor@Hospital",
    "Doctor/One",
    "Доктор",
  ])("rejects invalid username %j before calling the clinical API", async username => {
    const { app, auth, accountControl } = setup()
    const cookie = await passwordCookie(app, auth)
    const response = await app.request("/status/accounts", {
      method: "POST",
      headers: origin({
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams({
        username,
        email: "",
        firstName: "Нова",
        lastName: "Лекарка",
        title: "",
        institutionId: "inst-1",
        accessProfile: "CLINICAL_MEMBER",
        locale: "bg",
      }),
    })
    expect(response.status).toBe(400)
    expect(accountControl.create).not.toHaveBeenCalled()
  })

  it("passes a blank contact email as null without changing username casing", async () => {
    const { app, auth, accountControl } = setup()
    const cookie = await passwordCookie(app, auth)
    const response = await app.request("/status/accounts", {
      method: "POST",
      headers: origin({
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams({
        username: "Mixed.Case_1",
        email: "",
        firstName: "Нова",
        lastName: "Лекарка",
        title: "",
        institutionId: "inst-1",
        accessProfile: "CLINICAL_MEMBER",
        locale: "bg",
      }),
    })
    expect(response.status).toBe(201)
    expect(accountControl.create).toHaveBeenCalledWith(expect.objectContaining({
      username: "Mixed.Case_1",
      email: null,
    }))
  })

  it("creates the account and shows its activation URL exactly once without recording it", async () => {
    const { app, auth, accountControl, db } = setup()
    const cookie = await passwordCookie(app, auth)
    const response = await app.request("/status/accounts", {
      method: "POST",
      headers: origin({
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: new URLSearchParams({
        username: "New.Doctor1",
        email: "new.doctor@example.test",
        firstName: "Нова",
        lastName: "Лекарка",
        title: "д-р",
        institutionId: "inst-1",
        accessProfile: "CLINICAL_MEMBER",
        locale: "bg",
      }),
    })
    const body = await response.text()
    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(body).toContain(SECRET.replaceAll("&", "&amp;"))
    expect(body).toContain("показва само веднъж")
    expect(accountControl.create).toHaveBeenCalledWith(expect.objectContaining({
      username: "New.Doctor1",
      email: "new.doctor@example.test",
      accessProfile: "CLINICAL_MEMBER",
    }))
    expect(JSON.stringify(db.getDashboard(NOW))).not.toContain("hospitalToken")
    expect(JSON.stringify(db.getDashboard(NOW))).not.toContain("new.doctor@example.test")
  })

  it("reissues activation and recovery links through separate POST-only actions", async () => {
    const { app, auth, accountControl } = setup()
    const cookie = await passwordCookie(app, auth)
    const headers = origin({ cookie, "content-type": "application/x-www-form-urlencoded" })
    const activation = await app.request("/status/accounts/user-1/activation", {
      method: "POST",
      headers,
    })
    expect(activation.status).toBe(200)
    expect(await activation.text()).toContain(SECRET)
    expect(accountControl.reissueActivation).toHaveBeenCalledWith("user-1")

    const recovery = await app.request("/status/accounts/user-1/recovery", {
      method: "POST",
      headers,
    })
    expect(recovery.status).toBe(200)
    expect(await recovery.text()).toContain("R".repeat(43))
    expect(accountControl.issueRecovery).toHaveBeenCalledWith("user-1")
  })

  it("prevents a console-recovery Status session from viewing or minting account links", async () => {
    const { app, auth, accountControl } = setup()
    const cookie = await recoveryCookie(app, auth)
    const page = await app.request("/status/accounts", { headers: { cookie } })
    expect(page.status).toBe(403)
    expect(await page.text()).toContain("Аварийните сесии")

    const mutation = await app.request("/status/accounts/user-1/recovery", {
      method: "POST",
      headers: origin({ cookie }),
    })
    expect(mutation.status).toBe(403)
    expect(accountControl.issueRecovery).not.toHaveBeenCalled()
  })

  it("rejects cross-origin account mutations before calling the API", async () => {
    const { app, auth, accountControl } = setup()
    const cookie = await passwordCookie(app, auth)
    const response = await app.request("/status/accounts/user-1/activation", {
      method: "POST",
      headers: { cookie },
    })
    expect(response.status).toBe(403)
    expect(accountControl.reissueActivation).not.toHaveBeenCalled()
  })
})
