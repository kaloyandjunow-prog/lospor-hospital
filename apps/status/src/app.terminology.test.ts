import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStatusApp } from "./app.js"
import { AuthService } from "./auth.js"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"
import { TERMINOLOGY_REQUEST_FILE } from "./update-requests.js"
import { sha256 } from "./util.js"

const NOW = Date.parse("2026-08-23T09:00:00Z")
const PASSWORD = "Initial password phrase1!"
const databases: StatusDatabase[] = []
const directories: string[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})

function setup(term: Record<string, unknown> = {}) {
  const workspace = mkdtempSync(join(tmpdir(), "lospor-status-term-"))
  directories.push(workspace)
  const requestsDir = join(workspace, "requests")
  const stateDir = join(workspace, "state")
  const signalsDir = join(workspace, "signals")
  for (const directory of [requestsDir, stateDir, signalsDir]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(stateDir, "update-agent-installation.v1.json"), JSON.stringify({
    schemaVersion: 1,
    signalType: "update-agent-installation",
    observedAt: new Date(NOW - 30_000).toISOString(),
    mode: "agent",
  }))
  writeFileSync(join(stateDir, "update-agent.v2.json"), JSON.stringify({
    schemaVersion: 2,
    signalType: "update-agent",
    observedAt: new Date(NOW - 30_000).toISOString(),
    phase: "idle",
    resultCode: "UPDATE_AGENT_READY",
  }))
  writeFileSync(join(stateDir, "terminology-agent.v1.json"), JSON.stringify({
    schemaVersion: 1,
    signalType: "terminology-agent",
    observedAt: new Date(NOW - 30_000).toISOString(),
    phase: "idle",
    resultCode: "TERMINOLOGY_AGENT_READY",
    rollbackAvailable: true,
    packageId: "hospital-omop",
    packageVersion: "2026.08",
    activatedAt: "2026-08-22T12:00:00Z",
    manifestSha256: "a".repeat(64),
    ...term,
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
  return { app: createStatusApp({ db, auth, config, now: () => NOW }), auth, db, requestsDir, stateDir }
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

const post = (app: ReturnType<typeof setup>["app"], cookie: string, form: Record<string, string>, origin = "https://hospital.test") =>
  app.request("/status/terminology/actions", {
    method: "POST",
    headers: headers({ cookie, origin, "content-type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams(form).toString(),
  })

describe("the terminology page", () => {
  it("requires a Status session and shows only bounded active provenance", async () => {
    const { app, auth } = setup()
    expect(await (await app.request("/status/terminology")).text()).toContain("Sign in")
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/terminology", { headers: headers({ cookie }) })).text()
    expect(body).toContain("hospital-omop")
    expect(body).toContain("a".repeat(64))
    expect(body).toContain("Verify, stage and activate")
    expect(body).not.toContain("lospor_previous_")
    expect(body).not.toContain("/opt/")
    expect(body).not.toContain("docker compose")
  })

  it("offers the package folders the host found, and still lets a name be typed", async () => {
    const { app, auth, stateDir } = setup()
    const cookie = await signIn(auth)
    const before = await (await app.request("/status/terminology", { headers: headers({ cookie }) })).text()
    expect(before).toContain("No package folder with a manifest.json was found under reference-data yet.")
    expect(before).not.toContain("<datalist")
    writeFileSync(join(stateDir, "terminology-packages.v1.json"), JSON.stringify({
      schemaVersion: 1,
      signalType: "terminology-packages",
      observedAt: new Date(NOW - 30_000).toISOString(),
      packages: ["omop-2026.09"],
    }))
    const body = await (await app.request("/status/terminology", { headers: headers({ cookie }) })).text()
    expect(body).toContain('list="term-import-packages"')
    expect(body).toContain('<option value="omop-2026.09"></option>')
    expect(body).toContain("Found on the server:")
    expect(body).toContain('pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,79}"')
  })

  it("renders the workflow in Bulgarian without raw pending enums", async () => {
    const { app, auth } = setup({ pendingPhase: "validated" })
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/terminology", {
      headers: headers({ cookie: `${cookie}; lospor_status_locale=bg` }),
    })).text()
    expect(body).toContain("Управление на терминологията")
    expect(body).toContain("SHA-256 на манифеста")
    expect(body).toContain("подготвеното поколение е валидирано")
    expect(body).not.toContain("manifest-а")
    expect(body).not.toContain("manifest-ът")
    expect(body).not.toContain(">validated<")
    expect(body).toContain("Възобновяване на същия импорт")
    expect(body).not.toContain("Проверка, подготовка и активиране")
  })
})

describe("requesting a terminology operation", () => {
  it("records bounded import intent only after fresh password confirmation", async () => {
    const { app, auth, requestsDir, db } = setup({ rollbackAvailable: false })
    const cookie = await signIn(auth)
    const response = await post(app, cookie, {
      action: "import",
      packageDirectory: "approved-omop-2026.08",
      confirmation: "STOP-CLINICAL-SERVICES",
      password: PASSWORD,
    })
    expect(response.status).toBe(303)
    const fields = readFileSync(join(requestsDir, TERMINOLOGY_REQUEST_FILE), "utf8").trim().split("\t")
    expect(fields).toEqual([
      "LOSPOR-HOSPITAL-TERMINOLOGY-REQUEST-V1",
      "import",
      expect.stringMatching(/^[a-f0-9]{32}$/),
      "approved-omop-2026.08",
      String(Math.floor(NOW / 1000)),
      `status-operator-${sha256("admin+status@hospital.test").slice(0, 16)}`,
    ])
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_TERMINOLOGY_IMPORT_REQUESTED")).toBe(true)
  })

  it.each(["../licensed", "nested/package", ".hidden", "package name", "https://example.test/x"])(
    "refuses a path, URL or unsafe label: %s",
    async packageDirectory => {
      const { app, auth, requestsDir } = setup({ rollbackAvailable: false })
      const cookie = await signIn(auth)
      const response = await post(app, cookie, {
        action: "import",
        packageDirectory,
        confirmation: "STOP-CLINICAL-SERVICES",
        password: PASSWORD,
      })
      expect(response.status).toBe(400)
      expect(readdirSync(requestsDir)).toEqual([])
    },
  )

  it("refuses the wrong password, missing explicit confirmation and another origin", async () => {
    const { app, auth, requestsDir } = setup({ rollbackAvailable: false })
    const cookie = await signIn(auth)
    expect((await post(app, cookie, {
      action: "import", packageDirectory: "approved", confirmation: "STOP-CLINICAL-SERVICES", password: "wrong",
    })).status).toBe(401)
    expect((await post(app, cookie, {
      action: "import", packageDirectory: "approved", password: PASSWORD,
    })).status).toBe(400)
    expect((await post(app, cookie, {
      action: "import", packageDirectory: "approved", confirmation: "STOP-CLINICAL-SERVICES", password: PASSWORD,
    }, "https://elsewhere.test")).status).toBe(403)
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("keeps recovery sessions read-only", async () => {
    const { app, auth, requestsDir } = setup({ rollbackAvailable: false })
    const cookie = await signIn(auth, true)
    const page = await (await app.request("/status/terminology", { headers: headers({ cookie }) })).text()
    expect(page).toContain("can inspect this page but cannot change terminology")
    const response = await post(app, cookie, {
      action: "import", packageDirectory: "approved", confirmation: "STOP-CLINICAL-SERVICES", password: PASSWORD,
    })
    expect(response.status).toBe(403)
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("binds rollback and permanent finalization to host state and exact confirmations", async () => {
    const rollbackSetup = setup()
    const rollbackCookie = await signIn(rollbackSetup.auth)
    expect((await post(rollbackSetup.app, rollbackCookie, {
      action: "rollback", confirmation: "ROLLBACK-TERMINOLOGY", password: PASSWORD,
    })).status).toBe(303)
    expect(readFileSync(join(rollbackSetup.requestsDir, TERMINOLOGY_REQUEST_FILE), "utf8"))
      .toContain("\trollback\t")

    const finalizeSetup = setup()
    const finalizeCookie = await signIn(finalizeSetup.auth)
    expect((await post(finalizeSetup.app, finalizeCookie, {
      action: "finalize", confirmation: "DELETE-ROLLBACK-GENERATION", password: PASSWORD,
    })).status).toBe(303)
    const fields = readFileSync(join(finalizeSetup.requestsDir, TERMINOLOGY_REQUEST_FILE), "utf8").trim().split("\t")
    expect(fields[1]).toBe("finalize")
    expect(fields[3]).toBe("-")
  })

  it("permits resume only while a staged generation is recorded", async () => {
    const absent = setup({ rollbackAvailable: false })
    const absentCookie = await signIn(absent.auth)
    expect((await post(absent.app, absentCookie, {
      action: "resume", packageDirectory: "approved", confirmation: "STOP-CLINICAL-SERVICES", password: PASSWORD,
    })).status).toBe(409)
    expect(readdirSync(absent.requestsDir)).toEqual([])

    const pending = setup({ rollbackAvailable: false, pendingPhase: "validated" })
    const pendingCookie = await signIn(pending.auth)
    expect((await post(pending.app, pendingCookie, {
      action: "resume", packageDirectory: "approved", confirmation: "STOP-CLINICAL-SERVICES", password: PASSWORD,
    })).status).toBe(303)
  })

  it("fails closed when the terminology heartbeat is stale or needs operator review", async () => {
    const stale = setup({ observedAt: new Date(NOW - 11 * 60_000).toISOString() })
    const staleCookie = await signIn(stale.auth)
    expect((await post(stale.app, staleCookie, {
      action: "rollback", confirmation: "ROLLBACK-TERMINOLOGY", password: PASSWORD,
    })).status).toBe(409)
    expect(readdirSync(stale.requestsDir)).toEqual([])

    const blocked = setup({ phase: "needs-operator", resultCode: "TERMINOLOGY_AMBIGUOUS_OPERATION" })
    const blockedCookie = await signIn(blocked.auth)
    expect((await post(blocked.app, blockedCookie, {
      action: "rollback", confirmation: "ROLLBACK-TERMINOLOGY", password: PASSWORD,
    })).status).toBe(409)
    expect(readdirSync(blocked.requestsDir)).toEqual([])
  })
})
