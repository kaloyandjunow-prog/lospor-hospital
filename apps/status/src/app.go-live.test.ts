import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStatusApp } from "./app.js"
import { AuthService } from "./auth.js"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"

const NOW = Date.parse("2026-09-13T09:00:00Z")
const PASSWORD = "Initial password phrase1!"
const databases: StatusDatabase[] = []
const directories: string[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})

function setup() {
  const workspace = mkdtempSync(join(tmpdir(), "lospor-status-golive-"))
  directories.push(workspace)
  const stateDir = join(workspace, "state")
  const signalsDir = join(workspace, "signals")
  const requestsDir = join(workspace, "requests")
  for (const directory of [stateDir, signalsDir, requestsDir]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(stateDir, "terminology-agent.v1.json"), JSON.stringify({
    schemaVersion: 1,
    signalType: "terminology-agent",
    observedAt: new Date(NOW - 30_000).toISOString(),
    phase: "idle",
    resultCode: "TERMINOLOGY_AGENT_READY",
    rollbackAvailable: false,
  }))
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  const auth = new AuthService(db, Buffer.alloc(32, 7), 4, () => NOW)
  const config = {
    defaultLocale: "en",
    basePath: "/status",
    eventTokens: new Map(),
    signalsDir,
    updateRequestsDir: requestsDir,
    updateStateDir: stateDir,
    rateLimitKey: Buffer.alloc(32, 7),
  } as unknown as StatusConfig
  return { app: createStatusApp({ db, auth, config, now: () => NOW }), auth, db }
}

const headers = (extra: Record<string, string> = {}) => ({
  origin: "https://hospital.test",
  host: "hospital.test",
  "x-forwarded-proto": "https",
  ...extra,
})

async function signIn(auth: AuthService, recovery = false) {
  await auth.initialize("admin+status@hospital.test", PASSWORD)
  if (recovery) {
    const result = await auth.loginWithRecoveryToken({
      recoveryToken: auth.createRecoveryToken().token,
      clientAddress: "127.0.0.1",
    })
    return `lospor_status_session=${result.sessionToken}`
  }
  const challenge = await auth.beginPasswordLogin({
    email: "admin+status@hospital.test",
    password: PASSWORD,
    clientAddress: "127.0.0.1",
  })
  const result = auth.completeMfaLogin({
    challengeToken: challenge.challengeToken,
    code: totpCode(challenge.manualKey!, NOW),
    clientAddress: "127.0.0.1",
  })
  return `lospor_status_session=${result.sessionToken}`
}

const post = (app: ReturnType<typeof setup>["app"], cookie: string, form: Record<string, string>) =>
  app.request("/status/go-live/signoff", {
    method: "POST",
    headers: headers({ cookie, "content-type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams(form).toString(),
  })

describe("the go-live page", () => {
  it("requires a session and says a fresh appliance is not yet approved", async () => {
    const { app, auth } = setup()
    expect(await (await app.request("/status/go-live")).text()).toContain("Sign in")
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/go-live", { headers: headers({ cookie }) })).text()
    expect(body).toContain("Installed, not yet approved for clinical use")
    expect(body).toContain("Optional: an Athena terminology package is imported")
    expect(body).toContain("Record sign-off")
  })

  it("renders in Bulgarian", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/go-live", {
      headers: headers({ cookie: `${cookie}; lospor_status_locale=bg` }),
    })).text()
    expect(body).toContain("Инсталирано, но все още не е одобрено за клинична употреба")
    expect(body).toContain("Следваща стъпка")
    expect(body).toContain("5. Приемане от хората")
    expect(body).not.toContain("Next step")
  })

  it("leads with the next step, how far along it is, and where each step is done", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/go-live", { headers: headers({ cookie }) })).text()
    // Nothing is observed on a bare test appliance, so the journey starts at its first step.
    expect(body).toContain("0 of 14 steps done")
    const next = body.slice(body.indexOf("Next step"), body.indexOf("1. Reach the appliance safely"))
    expect(next).toContain("All appliance services are healthy")
    expect(next).toContain("sudo losporctl status")
    for (const stage of ["1. Reach the appliance safely", "2. Protect the data", "3. Keep it maintained", "4. Clinical content", "5. Accepted by people"]) {
      expect(body).toContain(stage)
    }
    // A Status page for what Status does, a command for what it deliberately cannot.
    expect(body).toContain('href="/status/maintenance#maintenance-offhost"')
    expect(body).toContain('href="/status/maintenance#maintenance-escrow"')
    expect(body).toContain("sudo losporctl config certificate operator FULLCHAIN KEY CA")
    expect(body).toContain("Clinical lead")
    expect(body.indexOf("2. Protect the data")).toBeLessThan(body.indexOf("4. Clinical content"))
  })
})

describe("signing in while go-live is unfinished", () => {
  it("lands on the go-live journey instead of the overview", async () => {
    const { app, auth } = setup()
    await auth.initialize("admin+status@hospital.test", PASSWORD)
    const begin = await app.request("/status/login", {
      method: "POST",
      headers: headers({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ email: "admin+status@hospital.test", password: PASSWORD }).toString(),
    })
    const html = await begin.text()
    const challengeToken = html.match(/name="challengeToken" value="([^"]+)"/)![1]
    const manualKey = html.match(/<div class="secret">([A-Z2-7]+)<\/div>/)?.[1]
    expect(manualKey).toBeTruthy()
    const done = await app.request("/status/login/mfa", {
      method: "POST",
      headers: headers({ "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ challengeToken, code: totpCode(manualKey!, NOW) }).toString(),
    })
    // The first sign-in shows the recovery codes once; their "continue" goes to the journey.
    expect(await done.text()).toContain('href="/status/go-live"')
  })
})

describe("recording a go-live sign-off", () => {
  it("records a sign-off only after the administrator password, with a pseudonymous operator", async () => {
    const { app, auth, db } = setup()
    const cookie = await signIn(auth)
    const response = await post(app, cookie, { item: "restore-drill", action: "sign", note: "Restored backup to temp DB, 3 cases checked", password: PASSWORD })
    expect(response.status).toBe(303)
    const [signoff] = db.listGoLiveSignoffs()
    expect(signoff).toMatchObject({ item: "restore-drill", signedAt: NOW, note: "Restored backup to temp DB, 3 cases checked" })
    expect(signoff!.operatorRef).toMatch(/^status-operator-[a-f0-9]{16}$/)
    expect(signoff!.operatorRef).not.toContain("admin")
    const page = await (await app.request("/status/go-live", { headers: headers({ cookie }) })).text()
    expect(page).toContain("Restored backup to temp DB, 3 cases checked")
    expect(page).toContain("Withdraw")
  })

  it("refuses a wrong password, an unknown item, and a missing note without recording anything", async () => {
    const { app, auth, db } = setup()
    const cookie = await signIn(auth)
    expect((await post(app, cookie, { item: "restore-drill", action: "sign", note: "done", password: "wrong password" })).status).toBe(401)
    expect((await post(app, cookie, { item: "anything-else", action: "sign", note: "done", password: PASSWORD })).status).toBe(400)
    expect((await post(app, cookie, { item: "restore-drill", action: "sign", note: "", password: PASSWORD })).status).toBe(400)
    expect(db.listGoLiveSignoffs()).toEqual([])
  })

  it("withdraws a sign-off with the password", async () => {
    const { app, auth, db } = setup()
    const cookie = await signIn(auth)
    await post(app, cookie, { item: "clinical-acceptance", action: "sign", note: "Ward acceptance 12 Sep", password: PASSWORD })
    expect(db.listGoLiveSignoffs()).toHaveLength(1)
    expect((await post(app, cookie, { item: "clinical-acceptance", action: "withdraw", password: PASSWORD })).status).toBe(303)
    expect(db.listGoLiveSignoffs()).toEqual([])
  })

  it("refuses console-recovery sessions and cross-origin requests", async () => {
    const { app, auth, db } = setup()
    const recovery = await signIn(auth, true)
    expect((await post(app, recovery, { item: "restore-drill", action: "sign", note: "done", password: PASSWORD })).status).toBe(403)
    const readOnly = await (await app.request("/status/go-live", { headers: headers({ cookie: recovery }) })).text()
    expect(readOnly).not.toContain("Record sign-off")
    const crossOrigin = await app.request("/status/go-live/signoff", {
      method: "POST",
      headers: headers({ cookie: recovery, origin: "https://attacker.test", "content-type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ item: "restore-drill", action: "sign", note: "done", password: PASSWORD }).toString(),
    })
    expect(crossOrigin.status).toBe(403)
    expect(db.listGoLiveSignoffs()).toEqual([])
  })
})
