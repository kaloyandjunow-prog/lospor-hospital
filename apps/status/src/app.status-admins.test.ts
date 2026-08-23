import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthService } from "./auth.js"
import { createStatusApp } from "./app.js"
import type { AccountControlPort } from "./account-control.js"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"

const NOW = Date.parse("2026-08-23T09:00:00.000Z")
const databases: StatusDatabase[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.close()
})

function setup() {
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  const auth = new AuthService(
    db,
    Buffer.alloc(32, 3),
    4,
    () => NOW,
    undefined,
    Buffer.alloc(32, 9),
  )
  const accountControl: AccountControlPort = {
    list: vi.fn(async () => ({
      accounts: [],
      institutions: [{
        id: "inst-1",
        name: "УМБАЛ Тест",
        city: "София",
        canHaveHeadOfDepartment: true,
      }],
    })),
    create: vi.fn(),
    reissueActivation: vi.fn(),
    issueRecovery: vi.fn(),
    changeRole: vi.fn(),
    changeUsername: vi.fn(),
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

async function passwordCookie(auth: AuthService) {
  await auth.initialize("chief.it@hospital.test", "Initial password phrase1!")
  const challenge = await auth.beginPasswordLogin({
    email: "chief.it@hospital.test",
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

function formHeaders(cookie?: string) {
  return origin({
    ...(cookie ? { cookie } : {}),
    "content-type": "application/x-www-form-urlencoded",
  })
}

function tokenFrom(body: string): string {
  const match = body.match(/#statusAdminToken=([A-Za-z0-9_-]{40,})/)
  if (!match?.[1]) throw new Error("Expected a one-time Status administrator token")
  return match[1]
}

async function createInvitation(
  app: ReturnType<typeof setup>["app"],
  cookie: string,
) {
  const response = await app.request("/status/status-admins", {
    method: "POST",
    headers: formHeaders(cookie),
    body: new URLSearchParams({
      displayName: "инж. Мария Иванова",
      email: "Second.IT@Hospital.test",
      reason: "Добавяне на втори дежурен ИТ администратор",
      currentPassword: "Initial password phrase1!",
    }),
  })
  const body = await response.text()
  return { response, body, token: tokenFrom(body) }
}

describe("Status administrator browser workflows", () => {
  it("renders one untiered combined-authority directory on the accounts page", async () => {
    const { app, auth } = setup()
    const cookie = await passwordCookie(auth)
    const response = await app.request("/status/accounts", { headers: { cookie } })
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).toContain("Администратори на Status")
    expect(body).toContain("Няма нива на права")
    expect(body).toContain("Технически операции + управление на клинични/изследователски профили")
    expect(body).toContain("сама по себе си не дава достъп до клинични записи")
    expect(body).toContain("Защитен първоначален главен ИТ администратор")
    expect(body).not.toContain('name="statusAdminRole"')
    expect(body).not.toContain('name="permissions"')
  })

  it("requires current-password reauthentication and records no plaintext invitation secret", async () => {
    const { app, auth, db } = setup()
    const cookie = await passwordCookie(auth)
    const rejected = await app.request("/status/status-admins", {
      method: "POST",
      headers: formHeaders(cookie),
      body: new URLSearchParams({
        displayName: "инж. Мария Иванова",
        email: "second.it@hospital.test",
        reason: "Добавяне на втори дежурен ИТ администратор",
        currentPassword: "Wrong password phrase9!",
      }),
    })
    expect(rejected.status).toBe(401)
    expect(auth.listStatusAdmins()).toHaveLength(1)

    const invitation = await createInvitation(app, cookie)
    expect(invitation.response.status).toBe(201)
    expect(invitation.response.headers.get("cache-control")).toContain("no-store")
    expect(invitation.body).toContain("#statusAdminToken=")
    expect(invitation.body).toContain("показва само веднъж")
    expect(invitation.body).not.toContain("Initial password phrase1!")
    expect(JSON.stringify({
      links: db.sqlite.prepare("SELECT * FROM status_admin_links").all(),
      events: db.getDashboard(NOW).events,
    })).not.toContain(invitation.token)
  })

  it("gives an IT colleague no clinical account, and leaves the founder the only holder of both", async () => {
    // The operator who installed the appliance holds both authorities: a
    // clinical ADMIN account created by bootstrap-hospital-admin, and the
    // initial chief identity here. That combination is deliberate and, by
    // default, theirs alone.
    //
    // An IT colleague they add gets the same Status authority -- there are no
    // tiers -- and no clinical account at all. The proof is that creating one
    // never reaches the clinical account API: not that it asks for a clinical
    // role and declines to use it, but that it has no clinical role to ask for.
    const { app, auth, accountControl } = setup()
    const cookie = await passwordCookie(auth)
    const invitation = await createInvitation(app, cookie)
    expect(invitation.response.status).toBe(201)

    expect(accountControl.create).not.toHaveBeenCalled()
    expect(accountControl.changeRole).not.toHaveBeenCalled()
    expect(accountControl.reissueActivation).not.toHaveBeenCalled()
    expect(accountControl.issueRecovery).not.toHaveBeenCalled()

    const admins = auth.listStatusAdmins()
    expect(admins).toHaveLength(2)
    expect(admins.filter(admin => admin.initialChief)).toHaveLength(1)
    expect(admins.find(admin => admin.initialChief)?.email).toBe("chief.it@hospital.test")
    expect(admins.find(admin => !admin.initialChief)?.email).toBe("second.it@hospital.test")
  })

  it("keeps the token in the fragment until a same-origin activation submission", async () => {
    const { app, auth } = setup()
    const cookie = await passwordCookie(auth)
    const invitation = await createInvitation(app, cookie)

    const script = await app.request("/status/admin-link.js")
    expect(script.status).toBe(200)
    expect(script.headers.get("content-type")).toContain("text/javascript")
    expect(script.headers.get("content-security-policy")).toContain("script-src 'self'")
    expect(await script.text()).toContain("location.hash")

    const setupPage = await app.request("/status/admin-activate?locale=en")
    const setupBody = await setupPage.text()
    expect(setupPage.status).toBe(200)
    expect(setupBody).toContain('<html lang="en">')
    expect(setupBody).toContain('name="token"')
    expect(setupBody).toContain('src="/status/admin-link.js"')
    expect(setupBody).not.toContain(invitation.token)

    const activation = await app.request("/status/admin-activate", {
      method: "POST",
      headers: formHeaders(),
      body: new URLSearchParams({
        locale: "bg",
        token: invitation.token,
        password: "Second password phrase2!",
        confirmPassword: "Second password phrase2!",
      }),
    })
    const activationBody = await activation.text()
    expect(activation.status).toBe(200)
    expect(activationBody).toContain("Администраторът е активиран")
    expect(activationBody).toContain("second.it@hospital.test")
    expect(activationBody).not.toContain(invitation.token)

    const replay = await app.request("/status/admin-activate", {
      method: "POST",
      headers: formHeaders(),
      body: new URLSearchParams({
        locale: "bg",
        token: invitation.token,
        password: "Another password phrase3!",
        confirmPassword: "Another password phrase3!",
      }),
    })
    expect(replay.status).toBe(410)
    expect(await replay.text()).toContain("вече използвана")
  })

  it("issues recovery, suspends non-chief admins, and refuses the protected chief", async () => {
    const { app, auth } = setup()
    const cookie = await passwordCookie(auth)
    const invitation = await createInvitation(app, cookie)
    await app.request("/status/admin-activate", {
      method: "POST",
      headers: formHeaders(),
      body: new URLSearchParams({
        token: invitation.token,
        password: "Second password phrase2!",
        confirmPassword: "Second password phrase2!",
      }),
    })
    const secondId = auth.listStatusAdmins().find(admin => !admin.initialChief)!.id
    const recovery = await app.request(`/status/status-admins/${secondId}/recovery`, {
      method: "POST",
      headers: formHeaders(cookie),
      body: new URLSearchParams({
        reason: "Възстановяване след загубено устройство на колегата",
        currentPassword: "Initial password phrase1!",
      }),
    })
    expect(recovery.status).toBe(200)
    expect(await recovery.text()).toContain("#statusAdminToken=")

    const suspended = await app.request(`/status/status-admins/${secondId}/suspend`, {
      method: "POST",
      headers: formHeaders(cookie),
      body: new URLSearchParams({
        reason: "Временно спиране при напускане на дежурния екип",
        currentPassword: "Initial password phrase1!",
      }),
    })
    expect(suspended.status).toBe(303)
    expect(auth.listStatusAdmins().find(admin => admin.id === secondId)?.state).toBe("SUSPENDED")

    const protectedChief = await app.request("/status/status-admins/initial-chief/suspend", {
      method: "POST",
      headers: formHeaders(cookie),
      body: new URLSearchParams({
        reason: "Проверка на защитата на главния администратор",
        currentPassword: "Initial password phrase1!",
      }),
    })
    expect(protectedChief.status).toBe(409)
    expect(await protectedChief.text()).toContain("Защитеният първоначален")
  })

  it("refuses console-recovery sessions and cross-origin lifecycle mutations", async () => {
    const { app, auth } = setup()
    await auth.initialize("chief.it@hospital.test", "Initial password phrase1!")
    const recoveryToken = auth.createRecoveryToken()
    const recoveryLogin = await app.request("/status/login", {
      method: "POST",
      headers: formHeaders(),
      body: new URLSearchParams({ recoveryToken: recoveryToken.token }),
    })
    const recoveryCookie = recoveryLogin.headers.get("set-cookie")?.split(";")[0] ?? ""
    const forbiddenRecovery = await app.request("/status/status-admins", {
      method: "POST",
      headers: formHeaders(recoveryCookie),
      body: new URLSearchParams({
        displayName: "Втори администратор",
        email: "second@hospital.test",
        reason: "Добавяне на втори дежурен ИТ администратор",
        currentPassword: "Initial password phrase1!",
      }),
    })
    expect(forbiddenRecovery.status).toBe(403)

    const cookie = await (async () => {
      const challenge = await auth.beginPasswordLogin({
        email: "chief.it@hospital.test",
        password: "Initial password phrase1!",
        clientAddress: "127.0.0.2",
      })
      const result = auth.completeMfaLogin({
        challengeToken: challenge.challengeToken,
        code: totpCode(challenge.manualKey!, NOW),
        clientAddress: "127.0.0.2",
      })
      return `lospor_status_session=${result.sessionToken}`
    })()
    const crossOrigin = await app.request("/status/status-admins", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        displayName: "Втори администратор",
        email: "second@hospital.test",
        reason: "Добавяне на втори дежурен ИТ администратор",
        currentPassword: "Initial password phrase1!",
      }),
    })
    expect(crossOrigin.status).toBe(403)
    expect(auth.listStatusAdmins()).toHaveLength(1)
  })
})
