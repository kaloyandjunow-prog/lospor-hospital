import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStatusApp } from "./app.js"
import { AuthService } from "./auth.js"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { CHECK_REQUEST_FILE, PREPARE_REQUEST_FILE, REQUEST_FILE } from "./update-requests.js"
import { totpCode } from "./mfa.js"

// Asking for an update from the status page.
//
// Status cannot apply anything -- no docker socket, unprivileged, the agent's
// state mounted read-only. These cover the part it *can* do: leaving a request
// the host agent will act on, and refusing to leave one when it should not.

const databases: StatusDatabase[] = []
const dirs: string[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const NOW = Date.parse("2026-08-20T12:00:00.000Z")
const LOCK = "b".repeat(64)
const PASSWORD = "Initial password phrase1!"

function setup(update: Record<string, unknown> | null = {
  schemaVersion: 1,
  signalType: "appliance-update",
  observedAt: new Date(NOW - 60_000).toISOString(),
  state: "update-available",
  installedVersion: "1.2.0",
  latestVersion: "1.3.0",
  fetchedVersion: "1.3.0",
  fetchedLockSha256: LOCK,
}) {
  const workspace = mkdtempSync(join(tmpdir(), "lospor-release-"))
  dirs.push(workspace)
  const signalsDir = join(workspace, "signals")
  const requestsDir = join(workspace, "requests")
  const stateDir = join(workspace, "state")
  for (const dir of [signalsDir, requestsDir, stateDir]) mkdirSync(dir, { recursive: true })
  if (update) {
    writeFileSync(join(signalsDir, "appliance-update.v1.json"), JSON.stringify(update))
  }
  writeFileSync(join(stateDir, "update-agent-installation.v1.json"), JSON.stringify({
    schemaVersion: 1,
    signalType: "update-agent-installation",
    observedAt: new Date(NOW - 60_000).toISOString(),
    mode: "agent",
  }))
  writeFileSync(join(stateDir, "update-agent.v2.json"), JSON.stringify({
    schemaVersion: 2,
    signalType: "update-agent",
    observedAt: new Date(NOW - 60_000).toISOString(),
    phase: "prepared",
    resultCode: "UPDATE_PREPARED",
    targetVersion: "1.3.0",
    preparedVersion: "1.3.0",
    preparedLockSha256: LOCK,
    rollbackPolicy: "backup-required",
  }))

  const db = new StatusDatabase(":memory:")
  databases.push(db)
  const config = {
    defaultLocale: "en",
    basePath: "/status",
    eventTokens: new Map(),
    signalsDir,
    updateRequestsDir: requestsDir,
    updateStateDir: stateDir,
    installedVersion: "1.3.2",
    rateLimitKey: Buffer.alloc(32, 7),
  } as unknown as StatusConfig
  const auth = new AuthService(db, Buffer.alloc(32, 7), 4, () => NOW)
  const app = createStatusApp({ db, auth, config, now: () => NOW })
  return { app, auth, db, requestsDir, stateDir }
}

const headers = (extra: Record<string, string> = {}) => ({
  origin: "https://hospital.test",
  host: "hospital.test",
  "x-forwarded-proto": "https",
  ...extra,
})

async function signIn(_app: ReturnType<typeof setup>["app"], auth: AuthService, recovery = false) {
  await auth.initialize("admin@hospital.test", PASSWORD)
  if (recovery) {
    const result = await auth.loginWithRecoveryToken({
      recoveryToken: auth.createRecoveryToken().token,
      clientAddress: "127.0.0.1",
    })
    return `lospor_status_session=${result.sessionToken}`
  }
  const challenge = await auth.beginPasswordLogin({
    email: "admin@hospital.test",
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

const post = (app: ReturnType<typeof setup>["app"], path: string, cookie: string, form: Record<string, string>) =>
  app.request(path, {
    method: "POST",
    headers: headers({ cookie, "content-type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams(form).toString(),
  })

describe("the release page", () => {
  it("is not shown to anyone who is not signed in", async () => {
    const { app } = setup()
    const response = await app.request("/status/release")
    expect(await response.text()).toContain("Sign in")
  })

  it("names what is installed and what is ready", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(app, auth)
    const body = await (await app.request("/status/release", { headers: headers({ cookie }) })).text()
    expect(body).toContain("1.3.2")
    expect(body).not.toContain("1.2.0")
    expect(body).toContain("Apply 1.3.0")
  })

  it("shows the verified release dossier of the installed and the downloaded release", async () => {
    const { app, auth, stateDir } = setup()
    const dossier = (version: string, extra: Record<string, unknown> = {}) => ({
      schemaVersion: 1, signalType: "release-dossier", verifiedAt: "2026-08-20T11:00:00Z", version,
      commit: "0123456789abcdef0123456789abcdef01234567", createdAt: "2026-08-19T10:00:00.000Z",
      build: { runId: "34719828380", runAttempt: 1, runUrl: "https://github.com/kaloyandjunow-prog/lospor-hospital/actions/runs/34719828380/attempts/1" },
      images: 10, sbomComponents: 5321,
      vulnerabilities: { critical: 0, high: 1, exceptions: [{ image: "postgres", vulnerabilityId: "CVE-2026-16742", expiresAt: "2026-12-08" }] },
      compatibility: { rollbackPolicy: "backup-required", rollbackWindowDays: 0, schemaMaximum: "20260913130000_external_ai_models" },
      upstream: { api: "9.9.5", core: "9.9.2" },
      ...extra,
    })
    writeFileSync(join(stateDir, "release-dossier-1.3.2.v1.json"), JSON.stringify(dossier("1.3.2")))
    writeFileSync(join(stateDir, "release-dossier-1.3.0.v1.json"), JSON.stringify(dossier("1.3.0", { vulnerabilities: { critical: 2, high: 0, exceptions: [] } })))
    const cookie = await signIn(app, auth)
    const body = await (await app.request("/status/release", { headers: headers({ cookie }) })).text()
    expect(body).toContain("Installed release 1.3.2")
    expect(body).toContain("No critical vulnerabilities; the first accepted exception expires 2026-12-08.")
    expect(body).toContain("CVE-2026-16742 (postgres, until 2026-12-08)")
    expect(body).toContain("Downloaded release 1.3.0")
    expect(body).toContain("it reports critical vulnerabilities. Ask LOSPOR support before applying.")
    expect(body).toContain('href="https://github.com/kaloyandjunow-prog/lospor-hospital/actions/runs/34719828380/attempts/1"')

    // A projection under another release's name, or with anything extra, is not shown.
    writeFileSync(join(stateDir, "release-dossier-1.3.2.v1.json"), JSON.stringify(dossier("1.3.9")))
    writeFileSync(join(stateDir, "release-dossier-1.3.0.v1.json"), JSON.stringify(dossier("1.3.0", { note: "<script>" })))
    const refused = await (await app.request("/status/release", { headers: headers({ cookie }) })).text()
    expect(refused).not.toContain("Release dossier")
  })

  it("still names the installed release before an update signal exists", async () => {
    const { app, auth } = setup(null)
    const cookie = await signIn(app, auth)
    const body = await (await app.request("/status/release", { headers: headers({ cookie }) })).text()
    expect(body).toContain("1.3.2")
    expect(body).not.toContain("<b>Installed</b>-")
  })

  it("offers no new mutation while the agent requires operator recovery", async () => {
    const { app, auth, stateDir } = setup()
    writeFileSync(join(stateDir, "update-agent.v2.json"), JSON.stringify({
      schemaVersion: 2,
      signalType: "update-agent",
      observedAt: new Date(NOW - 60_000).toISOString(),
      phase: "needs-operator",
      resultCode: "UPDATE_AMBIGUOUS_APPLY",
      targetVersion: "1.3.0",
      preparedVersion: "1.3.0",
      preparedLockSha256: LOCK,
      rollbackPolicy: "backup-required",
    }))
    const cookie = await signIn(app, auth)
    const body = await (await app.request("/status/release", { headers: headers({ cookie }) })).text()
    expect(body).toContain("will not retry an ambiguous database or service mutation automatically")
    expect(body).not.toContain("Apply 1.3.0")
  })

  it("offers the newest release instead of applying an older staged release", async () => {
    const { app, auth, stateDir } = setup({
      schemaVersion: 1,
      signalType: "appliance-update",
      observedAt: new Date(NOW - 60_000).toISOString(),
      state: "update-available",
      installedVersion: "1.3.2",
      latestVersion: "1.3.3",
      fetchedVersion: "1.3.2",
      fetchedLockSha256: LOCK,
    })
    writeFileSync(join(stateDir, "update-agent.v2.json"), JSON.stringify({
      schemaVersion: 2,
      signalType: "update-agent",
      observedAt: new Date(NOW - 60_000).toISOString(),
      phase: "prepared",
      resultCode: "UPDATE_PREPARED",
      targetVersion: "1.3.2",
      preparedVersion: "1.3.2",
      preparedLockSha256: LOCK,
      rollbackPolicy: "backup-required",
    }))
    const cookie = await signIn(app, auth)
    const body = await (await app.request("/status/release", { headers: headers({ cookie }) })).text()
    expect(body).toContain("Download and verify 1.3.3")
    expect(body).not.toContain("Apply 1.3.2")
  })

  it("does not offer Apply for the release that is already installed", async () => {
    const { app, auth, stateDir } = setup({
      schemaVersion: 1,
      signalType: "appliance-update",
      observedAt: new Date(NOW - 60_000).toISOString(),
      state: "current",
      installedVersion: "1.3.2",
      latestVersion: "1.3.2",
      fetchedVersion: "1.3.2",
      fetchedLockSha256: LOCK,
    })
    writeFileSync(join(stateDir, "update-agent.v2.json"), JSON.stringify({
      schemaVersion: 2,
      signalType: "update-agent",
      observedAt: new Date(NOW - 60_000).toISOString(),
      phase: "prepared",
      resultCode: "UPDATE_PREPARED",
      targetVersion: "1.3.2",
      preparedVersion: "1.3.2",
      preparedLockSha256: LOCK,
      rollbackPolicy: "backup-required",
    }))
    const cookie = await signIn(app, auth)
    const body = await (await app.request("/status/release", { headers: headers({ cookie }) })).text()
    expect(body).not.toContain("Apply 1.3.2")
    expect(body).toContain("This appliance is running the newest release it knows about")
  })

})

describe("asking for an update", () => {
  it("writes a manual check request from the authenticated release page", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth)
    const response = await post(app, "/status/actions/check", cookie, {})
    expect(response.status).toBe(303)
    expect(readFileSync(join(requestsDir, CHECK_REQUEST_FILE), "utf8").trim().split("\t")).toEqual([
      "LOSPOR-HOSPITAL-UPDATE-CHECK-V1",
      String(Math.floor(NOW / 1000)),
    ])
  })

  it("refuses a manual check request from another origin", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth)
    const response = await app.request("/status/actions/check", {
      method: "POST",
      headers: { origin: "https://elsewhere.test", host: "hospital.test", cookie },
    })
    expect(response.status).toBe(403)
    expect(readdirSync(requestsDir)).toEqual([])
  })

  // The confirmation exists so the destructive step is never one click from a
  // page that might have been left open.
  it("acts on nothing when the button is first pressed", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth)

    const response = await post(app, "/status/actions/apply", cookie, { targetLockSha256: LOCK })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("This restarts the clinical services")
    expect(readdirSync(requestsDir)).toEqual([])
  })

  // A page that reloads every fifteen seconds while somebody reads a warning
  // loses their place. This is the one page that must be read.
  it("does not put the confirmation page on a refresh timer", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(app, auth)
    const body = await (await post(app, "/status/actions/apply", cookie, { targetLockSha256: LOCK })).text()
    expect(body).not.toContain("http-equiv=\"refresh\"")
  })

  it("writes the request only after the confirmation", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth)
    const confirmPage = await (await post(app, "/status/actions/apply", cookie, { targetLockSha256: LOCK })).text()
    const confirmation = /name="confirmation" value="([a-f0-9]{64})"/.exec(confirmPage)?.[1]
    expect(confirmation).toBeTruthy()

    const response = await post(app, "/status/actions/apply/confirm", cookie, {
      targetLockSha256: LOCK, confirmation: confirmation!, window: "scheduled",
    })
    expect(response.status).toBe(303)

    const written = readFileSync(join(requestsDir, REQUEST_FILE), "utf8").trim().split("\t")
    expect(written).toEqual([
      "LOSPOR-HOSPITAL-UPDATE-REQUEST-V2",
      "apply",
      expect.stringMatching(/^[a-f0-9]{32}$/),
      "1.3.0",
      String(Math.floor(NOW / 1000)),
      "scheduled",
    ])
  })

  it("refuses a confirmation that was not issued for this release", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth)
    const response = await post(app, "/status/actions/apply/confirm", cookie, {
      targetLockSha256: LOCK, confirmation: "f".repeat(64), window: "scheduled",
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("expired or was not issued")
    expect(readdirSync(requestsDir)).toEqual([])
  })

  // If a newer release landed while the operator was reading, this is where
  // they find out -- rather than approving one release and getting another.
  it("refuses a digest that is no longer the one on offer", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth)
    const response = await post(app, "/status/actions/apply", cookie, { targetLockSha256: "c".repeat(64) })
    expect(await response.text()).toContain("no longer the one ready to apply")
    expect(readdirSync(requestsDir)).toEqual([])
  })


  it("refuses to apply a release that is already installed", async () => {
    const { app, auth, requestsDir, stateDir } = setup({
      schemaVersion: 1,
      signalType: "appliance-update",
      observedAt: new Date(NOW - 60_000).toISOString(),
      state: "current",
      installedVersion: "1.3.2",
      latestVersion: "1.3.2",
      fetchedVersion: "1.3.2",
      fetchedLockSha256: LOCK,
    })
    writeFileSync(join(stateDir, "update-agent.v2.json"), JSON.stringify({
      schemaVersion: 2,
      signalType: "update-agent",
      observedAt: new Date(NOW - 60_000).toISOString(),
      phase: "prepared",
      resultCode: "UPDATE_PREPARED",
      targetVersion: "1.3.2",
      preparedVersion: "1.3.2",
      preparedLockSha256: LOCK,
      rollbackPolicy: "backup-required",
    }))
    const cookie = await signIn(app, auth)
    const response = await post(app, "/status/actions/apply", cookie, { targetLockSha256: LOCK })
    expect(await response.text()).not.toContain("This restarts the clinical services")
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("refuses a request from another origin", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth)
    const response = await app.request("/status/actions/apply", {
      method: "POST",
      headers: { origin: "https://elsewhere.test", host: "hospital.test", cookie },
    })
    expect(response.status).toBe(403)
    expect(readdirSync(requestsDir)).toEqual([])
  })
})

describe("a recovery session", () => {
  // Break-glass for someone who has lost the password. The one thing it must do
  // is fix the credential; restarting the clinical stack is not that. It blocks
  // nothing legitimate -- anyone who can issue a recovery token has console
  // access and can update from there.
  it("is told plainly that it cannot apply", async () => {
    const { app, auth } = setup()
    const cookie = await signIn(app, auth, true)
    const body = await (await app.request("/status/release", { headers: headers({ cookie }) })).text()
    expect(body).toContain("cannot apply one")
    expect(body).not.toContain("Apply 1.3.0")
  })

  it("cannot reach the confirmation at all", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth, true)
    const response = await post(app, "/status/actions/apply", cookie, { targetLockSha256: LOCK })
    expect(await response.text()).not.toContain("This restarts the clinical services")
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("may still download, which changes nothing that is running", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(app, auth, true)
    const response = await post(app, "/status/actions/fetch", cookie, {})
    expect(response.status).toBe(303)
    expect(readdirSync(requestsDir)).toContain(PREPARE_REQUEST_FILE)
  })
})
