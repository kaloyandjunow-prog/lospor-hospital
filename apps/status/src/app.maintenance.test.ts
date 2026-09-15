import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStatusApp } from "./app.js"
import { AuthService } from "./auth.js"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"
import { MAINTENANCE_REQUEST_FILE, OFFHOST_PROPOSAL_FILE, SITE_CONFIG_PROPOSAL_FILE } from "./update-requests.js"
import { ALL_PRIVATE_NETWORKS } from "./maintenance.js"
import { sha256 } from "./util.js"

const NOW = Date.parse("2026-09-13T09:00:00Z")
const PASSWORD = "Initial password phrase1!"
const databases: StatusDatabase[] = []
const directories: string[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})

function setup(maintenance: Record<string, unknown> = {}) {
  const workspace = mkdtempSync(join(tmpdir(), "lospor-status-maintenance-"))
  directories.push(workspace)
  const requestsDir = join(workspace, "requests")
  const stateDir = join(workspace, "state")
  const signalsDir = join(workspace, "signals")
  for (const directory of [requestsDir, stateDir, signalsDir]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(stateDir, "update-agent-installation.v1.json"), JSON.stringify({
    schemaVersion: 1, signalType: "update-agent-installation", observedAt: new Date(NOW - 30_000).toISOString(), mode: "agent",
  }))
  writeFileSync(join(stateDir, "update-agent.v2.json"), JSON.stringify({
    schemaVersion: 2, signalType: "update-agent", observedAt: new Date(NOW - 30_000).toISOString(), phase: "idle", resultCode: "UPDATE_AGENT_READY",
  }))
  writeFileSync(join(stateDir, "maintenance-agent.v1.json"), JSON.stringify({
    schemaVersion: 1, signalType: "maintenance-agent", observedAt: new Date(NOW - 3_600_000).toISOString(),
    phase: "idle", resultCode: "MAINTENANCE_AGENT_READY", drills: [], ...maintenance,
  }))
  writeFileSync(join(stateDir, "site-config.v1.json"), JSON.stringify({
    schemaVersion: 1,
    signalType: "site-config",
    settings: {
      LOSPOR_DEFAULT_LOCALE: { value: "en", editable: true },
      HOSPITAL_CLINICAL_DOMAIN: { value: "clinical.example.org", editable: false },
      HOSPITAL_STATUS_ALLOWED_CIDRS: { value: "10.20.40.0/24", editable: true },
      HOSPITAL_SUPPORT_URL: { value: "", editable: true },
    },
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
  "x-forwarded-for": "10.20.40.7",
  ...extra,
})

async function signIn(auth: AuthService, recovery = false) {
  await auth.initialize("admin+status@hospital.test", PASSWORD)
  if (recovery) {
    const result = await auth.loginWithRecoveryToken({ recoveryToken: auth.createRecoveryToken().token, clientAddress: "127.0.0.1" })
    return `lospor_status_session=${result.sessionToken}`
  }
  const challenge = await auth.beginPasswordLogin({ email: "admin+status@hospital.test", password: PASSWORD, clientAddress: "127.0.0.1" })
  const result = auth.completeMfaLogin({ challengeToken: challenge.challengeToken, code: totpCode(challenge.manualKey!, NOW), clientAddress: "127.0.0.1" })
  return `lospor_status_session=${result.sessionToken}`
}

type App = ReturnType<typeof setup>["app"]
const post = (app: App, path: string, cookie: string, form: Record<string, string>, extra: Record<string, string> = {}) =>
  app.request(path, {
    method: "POST",
    headers: headers({ cookie, "content-type": "application/x-www-form-urlencoded", ...extra }),
    body: new URLSearchParams(form).toString(),
  })

/** Field values from a rendered confirmation form. */
function hiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const match of html.matchAll(/<input type="hidden" name="([A-Za-z0-9_]+)" value="([^"]*)">/g)) {
    fields[match[1]!] = match[2]!.replaceAll("&amp;", "&").replaceAll("&quot;", "\"")
  }
  return fields
}

describe("the maintenance page", () => {
  it("shows every action's consequences and the settings Status may not change", async () => {
    const { app, auth } = setup({
      drills: [{ completedAt: "2026-09-13T08:00:00Z", result: "passed", backup: "lospor-20260913T072635Z-W3UVqwGn.backup" }],
    })
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    for (const text of ["Back up now", "Run a restore drill", "Service interruption", "Cannot be undone", "Checked afterwards",
      "lospor-20260913T072635Z-W3UVqwGn.backup", "Changed only at the console", "clinical.example.org"]) {
      expect(body).toContain(text)
    }
    expect(body).not.toContain('name="HOSPITAL_CLINICAL_DOMAIN"')
    expect(body).toContain('name="HOSPITAL_SUPPORT_URL"')
  })

  it("is read-only for a recovery session, and refuses its requests", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(auth, true)
    const body = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(body).toContain("cannot request maintenance")
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "backup", password: PASSWORD })).status).toBe(403)
    expect(readdirSync(requestsDir)).toEqual([])
  })
})

describe("requesting a backup or a drill", () => {
  it("records fixed intent after the password, with the operator's pseudonym", async () => {
    const { app, auth, db, requestsDir } = setup()
    const cookie = await signIn(auth)
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "drill", password: PASSWORD })).status).toBe(303)
    const fields = readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").trim().split("\t")
    expect(fields[1]).toBe("drill")
    expect(fields[3]).toBe("-")
    expect(fields[5]).toMatch(/^status-operator-[a-f0-9]{16}$/)
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_MAINTENANCE_DRILL_REQUESTED")).toBe(true)
  })

  it("refuses a wrong password, another origin, an unknown action, and a busy host", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(auth)
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "backup", password: "wrong" })).status).toBe(401)
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "backup", password: PASSWORD }, { origin: "https://elsewhere.test" })).status).toBe(403)
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "restore", password: PASSWORD })).status).toBe(400)
    expect(readdirSync(requestsDir)).toEqual([])
    const busy = setup({ phase: "working", resultCode: "MAINTENANCE_RUNNING", lastAction: "backup" })
    const busyCookie = await signIn(busy.auth)
    expect((await post(busy.app, "/status/maintenance/actions", busyCookie, { action: "drill", password: PASSWORD })).status).toBe(409)
    expect(readdirSync(busy.requestsDir)).toEqual([])
  })
})

describe("changing site settings", () => {
  it("previews the change, then applies exactly the confirmed proposal", async () => {
    const { app, auth, requestsDir, db } = setup()
    const cookie = await signIn(auth)
    const preview = await post(app, "/status/maintenance/settings/preview", cookie, {
      HOSPITAL_SUPPORT_URL: "mailto:it@example.org", HOSPITAL_STATUS_ALLOWED_CIDRS: "10.20.40.0/24", LOSPOR_DEFAULT_LOCALE: "en",
    })
    expect(preview.status).toBe(200)
    const html = await preview.text()
    expect(html).toContain("(blank) → mailto:it@example.org")
    expect(readdirSync(requestsDir)).toEqual([])
    const fields = hiddenFields(html)
    expect((await post(app, "/status/maintenance/settings/apply", cookie, { ...fields, password: PASSWORD })).status).toBe(303)
    const proposal = readFileSync(join(requestsDir, SITE_CONFIG_PROPOSAL_FILE), "utf8")
    expect(proposal).toContain("HOSPITAL_SUPPORT_URL=mailto:it@example.org\n")
    expect(proposal).toContain("HOSPITAL_CLINICAL_DOMAIN=clinical.example.org\n")
    expect(readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[3]).toBe(fields.proposalSha256)
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_MAINTENANCE_SETTINGS_REQUESTED")).toBe(true)
  })

  it("refuses a Status network list that would lock out the computer making the change", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(auth)
    const response = await post(app, "/status/maintenance/settings/preview", cookie, { HOSPITAL_STATUS_ALLOWED_CIDRS: "10.99.0.0/24" })
    expect(response.status).toBe(400)
    expect(await response.text()).toContain("would lock you out")
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("refuses an invalid value and says nothing changed when nothing would", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(auth)
    const invalid = await post(app, "/status/maintenance/settings/preview", cookie, { HOSPITAL_SUPPORT_URL: "http://plain.example.org" })
    expect(invalid.status).toBe(400)
    const unchanged = await post(app, "/status/maintenance/settings/preview", cookie, { HOSPITAL_SUPPORT_URL: "" })
    expect(await unchanged.text()).toContain("Nothing to change")
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("refuses to apply when the values, the confirmation or the host settings differ from the preview", async () => {
    const { app, auth, requestsDir, stateDir } = setup()
    const cookie = await signIn(auth)
    const fields = hiddenFields(await (await post(app, "/status/maintenance/settings/preview", cookie, {
      HOSPITAL_SUPPORT_URL: "mailto:it@example.org",
    })).text())
    expect((await post(app, "/status/maintenance/settings/apply", cookie, {
      ...fields, HOSPITAL_SUPPORT_URL: "mailto:other@example.org", password: PASSWORD,
    })).status).toBe(409)
    expect((await post(app, "/status/maintenance/settings/apply", cookie, { ...fields, confirmation: "0".repeat(64), password: PASSWORD })).status).toBe(409)
    const site = JSON.parse(readFileSync(join(stateDir, "site-config.v1.json"), "utf8"))
    site.settings.LOSPOR_DEFAULT_LOCALE.value = "bg"
    writeFileSync(join(stateDir, "site-config.v1.json"), JSON.stringify(site))
    expect((await post(app, "/status/maintenance/settings/apply", cookie, { ...fields, password: PASSWORD })).status).toBe(409)
    expect(existsSync(join(requestsDir, MAINTENANCE_REQUEST_FILE))).toBe(false)
  })
})

describe("off-host copies from Status", () => {
  it("offers setup when nothing is configured, and refuses a test or drill until it is", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(body).toContain("Off-host copies are not set up")
    expect(body).toContain('action="/status/maintenance/offhost"')
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "offhost-test", password: PASSWORD })).status).toBe(409)
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("records an SFTP destination as a fixed-field proposal after the password", async () => {
    const { app, auth, requestsDir, db } = setup()
    const cookie = await signIn(auth)
    const response = await post(app, "/status/maintenance/offhost", cookie, {
      type: "sftp", host: "backup.hospital.test", port: "2222", user: "lospor", directory: "lospor-backups", password: PASSWORD,
    })
    expect(response.status).toBe(303)
    expect(readFileSync(join(requestsDir, OFFHOST_PROPOSAL_FILE), "utf8"))
      .toBe("type=sftp\nhost=backup.hospital.test\nport=2222\nuser=lospor\ndirectory=lospor-backups\n")
    expect(readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[1]).toBe("offhost-config")
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_MAINTENANCE_OFFHOST_CONFIG_REQUESTED")).toBe(true)
  })

  it("refuses an unsafe destination and a wrong password", async () => {
    const { app, auth, requestsDir } = setup()
    const cookie = await signIn(auth)
    expect((await post(app, "/status/maintenance/offhost", cookie, { type: "mount", path: "/opt/lospor-hospital/backups", password: PASSWORD })).status).toBe(400)
    expect((await post(app, "/status/maintenance/offhost", cookie, { type: "mount", path: "/mnt/lospor-backups", password: "wrong" })).status).toBe(401)
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("turns off-host copies off only when they are set up, after the password", async () => {
    const unset = setup()
    const unsetCookie = await signIn(unset.auth)
    expect((await post(unset.app, "/status/maintenance/actions", unsetCookie, { action: "offhost-disable", password: PASSWORD })).status).toBe(409)
    expect(readdirSync(unset.requestsDir)).toEqual([])

    const { app, auth, requestsDir, stateDir } = setup()
    writeFileSync(join(stateDir, "offhost.v1.json"), JSON.stringify({
      schemaVersion: 1, signalType: "offhost", observedAt: new Date(NOW - 60_000).toISOString(),
      destination: { type: "mount", path: "/mnt/lospor-backups" }, encryptionKeyFingerprint: "d9f6f5b437cdf812", drills: [],
    }))
    const cookie = await signIn(auth)
    const page = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(page).toContain("Turn off off-host copies")
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "offhost-disable", password: "wrong" })).status).toBe(401)
    expect(readdirSync(requestsDir)).toEqual([])
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "offhost-disable", password: PASSWORD })).status).toBe(303)
    expect(readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("	")[1]).toBe("offhost-disable")
  })

  it("shows the public key and pinned host keys, and requests a test and a drill", async () => {
    const { app, auth, requestsDir, stateDir } = setup()
    writeFileSync(join(stateDir, "offhost.v1.json"), JSON.stringify({
      schemaVersion: 1,
      signalType: "offhost",
      observedAt: new Date(NOW - 60_000).toISOString(),
      destination: { type: "sftp", host: "backup.hospital.test", port: 22, user: "lospor", directory: "lospor-backups" },
      sshPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILEGRRwahtYCtDjvfHPauq9loMXBk9YV5MttcPoLnVhV",
      hostKeyFingerprints: ["SHA256:hXX1vE8kygq7WwC/7qqqV95G+/hAAFK/kH370JphmHo"],
      encryptionKeyFingerprint: "d9f6f5b437cdf812",
      drills: [],
    }))
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(body).toContain("sftp://lospor@backup.hospital.test:22/lospor-backups")
    expect(body).toContain("AAAAC3NzaC1lZDI1NTE5AAAAILEGRRwahtYCtDjvfHPauq9loMXBk9YV5MttcPoLnVhV")
    expect(body).toContain("SHA256:hXX1vE8kygq7WwC/7qqqV95G+/hAAFK/kH370JphmHo")
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "offhost-drill", password: PASSWORD })).status).toBe(303)
    expect(readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[1]).toBe("offhost-drill")
  })
})

const ADVANCED = {
  HOSPITAL_BACKUP_INTERVAL_SECONDS: { value: 14400, minimum: 3600, maximum: 14400, default: 14400, overridden: false },
  HOSPITAL_BACKUP_DAILY_POINTS: { value: 21, minimum: 14, maximum: 90, default: 14, overridden: true },
  RESEARCH_EXPORT_RETENTION_DAYS: { value: 30, minimum: 1, maximum: 365, default: 30, overridden: false },
}

function withAdvanced(stateDir: string) {
  const current = JSON.parse(readFileSync(join(stateDir, "site-config.v1.json"), "utf8"))
  writeFileSync(join(stateDir, "site-config.v1.json"), JSON.stringify({ ...current, advanced: ADVANCED }))
}

function hostOs(stateDir: string, extra: Record<string, unknown> = {}) {
  writeFileSync(join(stateDir, "host-os.v1.json"), JSON.stringify({
    schemaVersion: 1, signalType: "host-os", observedAt: new Date(NOW - 30_000).toISOString(),
    release: "24.04", standardSupportEnds: "2029-04-30", securityUpdates: 3, otherUpdates: 12, dockerUpdates: false,
    updatesCheckedAt: "2026-09-13T06:00:00Z", automaticUpdates: "enabled", lastAutomaticRunAt: "2026-09-13T06:10:00Z",
    lastAutomaticResult: "success", rebootRequired: false, rebootRequiredSince: null, bootedAt: "2026-09-01T10:00:00Z",
    rebootPolicy: "manual", ...extra,
  }))
}

describe("advanced settings from Status", () => {
  it("shows values in hours and days with their limits, and marks what differs from the default", async () => {
    const { app, auth, stateDir } = setup()
    withAdvanced(stateDir)
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(body).toContain("1 value(s) differ from the defaults")
    expect(body).toContain('name="HOSPITAL_BACKUP_INTERVAL_SECONDS" value="4"')
    expect(body).toContain("1 to 4 hours; default 4")
    expect(body).toContain('name="HOSPITAL_BACKUP_DAILY_POINTS" value="21"')
  })

  it("previews a change in people's units, then applies exactly the confirmed advanced.env", async () => {
    const { app, auth, stateDir, requestsDir, db } = setup()
    withAdvanced(stateDir)
    const cookie = await signIn(auth)
    const preview = await post(app, "/status/maintenance/advanced/preview", cookie, {
      HOSPITAL_BACKUP_INTERVAL_SECONDS: "2", HOSPITAL_BACKUP_DAILY_POINTS: "21", RESEARCH_EXPORT_RETENTION_DAYS: "30",
    })
    expect(preview.status).toBe(200)
    const html = await preview.text()
    expect(html).toContain("4 hours → 2 hours")
    expect(readdirSync(requestsDir)).toEqual([])
    const fields = hiddenFields(html)
    expect((await post(app, "/status/maintenance/advanced/apply", cookie, { ...fields, password: PASSWORD })).status).toBe(303)
    expect(readFileSync(join(requestsDir, "advanced.proposal.v1.env"), "utf8")).toBe(
      "# Advanced settings proposed from Status.\nHOSPITAL_BACKUP_INTERVAL_SECONDS=7200\nHOSPITAL_BACKUP_DAILY_POINTS=21\n",
    )
    const request = readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")
    expect(request[1]).toBe("advanced")
    expect(request[3]).toBe(fields.proposalSha256)
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_MAINTENANCE_ADVANCED_REQUESTED")).toBe(true)
  })

  it("refuses a value outside its limits, and returns every value to its default on request", async () => {
    const { app, auth, stateDir, requestsDir } = setup()
    withAdvanced(stateDir)
    const cookie = await signIn(auth)
    const outside = await post(app, "/status/maintenance/advanced/preview", cookie, { HOSPITAL_BACKUP_INTERVAL_SECONDS: "8" })
    expect(outside.status).toBe(400)
    expect(await outside.text()).toContain("outside their limits: Take a backup every")
    const reset = await post(app, "/status/maintenance/advanced/preview", cookie, { reset: "all" })
    const html = await reset.text()
    expect(html).toContain("21 days → 14 days")
    expect((await post(app, "/status/maintenance/advanced/apply", cookie, { ...hiddenFields(html), password: PASSWORD })).status).toBe(303)
    expect(readFileSync(join(requestsDir, "advanced.proposal.v1.env"), "utf8")).toBe("# Advanced settings proposed from Status.\n")
  })
})

describe("Ubuntu maintenance from Status", () => {
  it("shows Ubuntu's state and requests security updates after the password", async () => {
    const { app, auth, stateDir, requestsDir, db } = setup()
    hostOs(stateDir)
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    for (const text of ["Server operating system (Ubuntu)", "2029-04-30", "Install security updates now", "Ubuntu does not need a restart right now."]) {
      expect(body).toContain(text)
    }
    expect(body).not.toContain('value="os-reboot"')
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "os-update", password: PASSWORD })).status).toBe(303)
    expect(readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[1]).toBe("os-update")
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_MAINTENANCE_OS_UPDATE_REQUESTED")).toBe(true)
  })

  it("offers a restart only when Ubuntu asks for one", async () => {
    const { app, auth, stateDir, requestsDir } = setup()
    hostOs(stateDir)
    const cookie = await signIn(auth)
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "os-reboot", password: PASSWORD })).status).toBe(409)
    expect(readdirSync(requestsDir)).toEqual([])
    hostOs(stateDir, { rebootRequired: true, rebootRequiredSince: "2026-09-12T06:10:00Z" })
    const body = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(body).toContain('value="os-reboot"')
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "os-reboot", password: PASSWORD })).status).toBe(303)
    expect(readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[1]).toBe("os-reboot")
  })
})

describe("the overview's to-do list", () => {
  it("lists what needs doing, with where to do it", async () => {
    const { app, auth, stateDir } = setup()
    hostOs(stateDir, { rebootRequired: true, rebootRequiredSince: "2026-09-01T06:10:00Z" })
    withAdvanced(stateDir)
    const cookie = await signIn(auth)
    const body = await (await app.request("/status/", { headers: headers({ cookie }) })).text()
    expect(body).toContain("Needs attention today")
    expect(body).toContain("Ubuntu needs a server restart to finish installing updates.")
    expect(body).toContain('href="/status/maintenance#maintenance-host-os"')
    expect(body).toContain("No restore drill has been run from Status yet.")
    expect(body).toContain("1 advanced setting(s) differ from the defaults on this appliance.")
  })
})

describe("the support bundle from Status", () => {
  const bundle = JSON.stringify({
    schemaVersion: 1, bundleType: "lospor-hospital-support", createdAt: "2026-09-13T08:30:00Z",
    release: "1.4.0", releaseLockSha256: "a".repeat(64), host: { os: "ubuntu" }, services: { api: "running:healthy" },
  })

  it("requests a bundle after the password, then offers exactly that file as a download", async () => {
    const { app, auth, stateDir, requestsDir, db } = setup()
    const cookie = await signIn(auth)
    expect(await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()).toContain("No support bundle has been written yet.")
    expect((await app.request("/status/maintenance/support-bundle", { headers: headers({ cookie }) })).status).toBe(404)
    expect((await post(app, "/status/maintenance/actions", cookie, { action: "support-bundle", password: PASSWORD })).status).toBe(303)
    expect(readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[1]).toBe("support-bundle")
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_MAINTENANCE_SUPPORT_BUNDLE_REQUESTED")).toBe(true)

    writeFileSync(join(stateDir, "support-bundle.v1.json"), bundle)
    expect(await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()).toContain('href="/status/maintenance/support-bundle"')
    const download = await app.request("/status/maintenance/support-bundle", { headers: headers({ cookie }) })
    expect(download.status).toBe(200)
    expect(download.headers.get("content-disposition")).toBe('attachment; filename="lospor-support-20260913T083000Z.json"')
    expect(download.headers.get("cache-control")).toContain("no-store")
    expect(await download.text()).toBe(bundle)
  })

  it("offers nothing that is not the support document, and nothing to a recovery session", async () => {
    const { app, auth, stateDir } = setup()
    writeFileSync(join(stateDir, "support-bundle.v1.json"), JSON.stringify({ schemaVersion: 1, bundleType: "something-else", createdAt: "2026-09-13T08:30:00Z", release: "1.4.0" }))
    const cookie = await signIn(auth)
    expect((await app.request("/status/maintenance/support-bundle", { headers: headers({ cookie }) })).status).toBe(404)
    writeFileSync(join(stateDir, "support-bundle.v1.json"), bundle)
    const recovery = await signIn(auth, true)
    expect((await app.request("/status/maintenance/support-bundle", { headers: headers({ cookie: recovery }) })).status).toBe(403)
  })
})

describe("credential rotation from Status", () => {
  it("needs the written confirmation and the password before it leaves a request", async () => {
    const { app, auth, requestsDir, db } = setup()
    const cookie = await signIn(auth)
    const page = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(page).toContain('value="ROTATE-CREDENTIALS"')
    expect(page).toContain("Patient-identity and encryption keys are never rotated here")

    const unconfirmed = await post(app, "/status/maintenance/actions", cookie, { action: "rotate-credentials", password: PASSWORD })
    expect(unconfirmed.status).toBe(400)
    expect(existsSync(join(requestsDir, MAINTENANCE_REQUEST_FILE))).toBe(false)

    const confirmed = await post(app, "/status/maintenance/actions", cookie, { action: "rotate-credentials", confirmation: "ROTATE-CREDENTIALS", password: PASSWORD })
    expect(confirmed.status).toBe(303)
    expect(readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[1]).toBe("rotate-credentials")
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_MAINTENANCE_ROTATION_REQUESTED")).toBe(true)
  })

  it("refuses a recovery session", async () => {
    const { app, auth, requestsDir } = setup()
    const recovery = await signIn(auth, true)
    const response = await post(app, "/status/maintenance/actions", recovery, { action: "rotate-credentials", confirmation: "ROTATE-CREDENTIALS", password: PASSWORD })
    expect(response.status).toBe(403)
    expect(existsSync(join(requestsDir, MAINTENANCE_REQUEST_FILE))).toBe(false)
  })
})

describe("the network lists left as installed", () => {
  const installed = (stateDir: string) => {
    const site = JSON.parse(readFileSync(join(stateDir, "site-config.v1.json"), "utf8"))
    site.settings.HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE = { value: "confirmed", editable: false }
    site.settings.HOSPITAL_RESEARCH_ALLOWED_CIDRS = { value: "127.0.0.1/32", editable: true }
    site.settings.HOSPITAL_STATUS_ALLOWED_CIDRS = { value: "10.0.0.0/8 172.16.0.0/12 192.168.0.0/16", editable: true }
    writeFileSync(join(stateDir, "site-config.v1.json"), JSON.stringify(site))
  }

  it("says so on the dashboard, in Settings and on Go-live", async () => {
    const { app, auth, stateDir } = setup()
    installed(stateDir)
    const cookie = await signIn(auth)
    const dashboard = await (await app.request("/status/", { headers: headers({ cookie }) })).text()
    expect(dashboard).toContain("Status can be opened from every internal hospital network. Limit it to the IT management networks.")
    expect(dashboard).toContain("The Research website is closed to every network until its networks are set.")
    const maintenance = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(maintenance).toContain("Status can be opened from every internal hospital network, as installed.")
    expect(maintenance).toContain("The Research website is closed (127.0.0.1/32), as installed.")
    const goLive = await (await app.request("/status/go-live", { headers: headers({ cookie }) })).text()
    expect(goLive).toContain("Hospital IT has set which networks may open Status and the Research website")
  })

  it("turns off the all-private switch in the same change that narrows the lists", async () => {
    const { app, auth, requestsDir, stateDir } = setup()
    installed(stateDir)
    const cookie = await signIn(auth)
    const preview = await post(app, "/status/maintenance/settings/preview", cookie, {
      HOSPITAL_STATUS_ALLOWED_CIDRS: "10.20.40.0/24", HOSPITAL_RESEARCH_ALLOWED_CIDRS: "10.20.30.0/24",
    })
    expect(preview.status).toBe(200)
    const fields = hiddenFields(await preview.text())
    expect((await post(app, "/status/maintenance/settings/apply", cookie, { ...fields, password: PASSWORD })).status).toBe(303)
    const proposal = readFileSync(join(requestsDir, SITE_CONFIG_PROPOSAL_FILE), "utf8")
    expect(proposal).toContain("HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE=\n")
    expect(proposal).toContain('HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.40.0/24"\n')
    expect(proposal).toContain('HOSPITAL_RESEARCH_ALLOWED_CIDRS="10.20.30.0/24"\n')
  })
})

describe("secrets escrow from Status", () => {
  const limitedNetworks = (stateDir: string, statusCidrs = "10.20.40.0/24") =>
    writeFileSync(join(stateDir, "site-config.v1.json"), JSON.stringify({
      schemaVersion: 1,
      signalType: "site-config",
      settings: {
        LOSPOR_DEFAULT_LOCALE: { value: "en", editable: true },
        HOSPITAL_STATUS_ALLOWED_CIDRS: { value: statusCidrs, editable: true },
        HOSPITAL_RESEARCH_ALLOWED_CIDRS: { value: "10.20.30.0/24", editable: true },
      },
    }))

  // Signs in, and returns the authenticator secret so a later code can confirm.
  async function signInWithSecret(auth: AuthService) {
    await auth.initialize("admin+status@hospital.test", PASSWORD)
    const challenge = await auth.beginPasswordLogin({ email: "admin+status@hospital.test", password: PASSWORD, clientAddress: "127.0.0.1" })
    const result = auth.completeMfaLogin({ challengeToken: challenge.challengeToken, code: totpCode(challenge.manualKey!, NOW), clientAddress: "127.0.0.1" })
    return { cookie: `lospor_status_session=${result.sessionToken}`, secret: challenge.manualKey! }
  }
  // The sign-in spent the current step; the next one confirms.
  const nextCode = (secret: string) => totpCode(secret, NOW + 30_000)
  const operatorRef = `status-operator-${sha256("admin+status@hospital.test").slice(0, 16)}`

  const offer = (stateDir: string, owner: string, bytes = Buffer.from("encrypted escrow bytes")) => {
    const digest = createHash("sha256").update(bytes).digest("hex")
    writeFileSync(join(stateDir, "secrets-escrow.v1.enc"), bytes)
    writeFileSync(join(stateDir, "secrets-escrow.v1.json"), JSON.stringify({
      schemaVersion: 1, signalType: "secrets-escrow", createdAt: new Date(NOW - 60_000).toISOString(),
      fileName: "lospor-hospital-secrets-20260913T085900Z.tar.gz.enc", sha256: digest, bytes: bytes.length, operatorRef: owner,
    }))
    return digest
  }

  it("is offered only once Status is limited to the IT management networks", async () => {
    const { app, auth, requestsDir, stateDir } = setup()
    const { cookie, secret } = await signInWithSecret(auth)
    limitedNetworks(stateDir, ALL_PRIVATE_NETWORKS.join(" "))
    const body = await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()
    expect(body).toContain("Secrets escrow")
    expect(body).not.toContain('action="/status/maintenance/escrow"')
    expect((await post(app, "/status/maintenance/escrow", cookie, { password: PASSWORD, code: nextCode(secret) })).status).toBe(409)
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("needs the password and a fresh authenticator code", async () => {
    const { app, auth, requestsDir, stateDir } = setup()
    const { cookie, secret } = await signInWithSecret(auth)
    limitedNetworks(stateDir)
    expect(await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()).toContain('action="/status/maintenance/escrow"')
    expect((await post(app, "/status/maintenance/escrow", cookie, { password: PASSWORD, code: "000000" })).status).toBe(401)
    expect((await post(app, "/status/maintenance/escrow", cookie, { password: "wrong", code: nextCode(secret) })).status).toBe(401)
    expect((await post(app, "/status/maintenance/escrow", cookie, { password: PASSWORD })).status).toBe(401)
    // The code the sign-in already spent cannot confirm.
    expect((await post(app, "/status/maintenance/escrow", cookie, { password: PASSWORD, code: totpCode(secret, NOW) })).status).toBe(401)
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("refuses a console-recovery session", async () => {
    const { app, auth, requestsDir, stateDir } = setup()
    const cookie = await signIn(auth, true)
    limitedNetworks(stateDir)
    expect((await post(app, "/status/maintenance/escrow", cookie, { password: PASSWORD, code: "123456" })).status).toBe(403)
    expect((await app.request("/status/maintenance/escrow/download", { headers: headers({ cookie }) })).status).toBe(403)
    expect(readdirSync(requestsDir)).toEqual([])
  })

  it("shows the passphrase once and leaves it for the host, readable by Status and root only", async () => {
    const { app, auth, db, requestsDir, stateDir } = setup()
    const { cookie, secret } = await signInWithSecret(auth)
    limitedNetworks(stateDir)
    const response = await post(app, "/status/maintenance/escrow", cookie, { password: PASSWORD, code: nextCode(secret) })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    const passphrase = (await response.text()).match(/<p class="secret">([a-z0-9-]+)<\/p>/)?.[1]
    expect(passphrase).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{5}(-[abcdefghjkmnpqrstuvwxyz23456789]{5}){5}$/)
    const proposal = readFileSync(join(requestsDir, "secrets-escrow.passphrase.v1"), "utf8")
    expect(proposal).toBe(`${passphrase}\n`)
    const fields = readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").trim().split("\t")
    expect([fields[1], fields[3], fields[5]]).toEqual(["secrets-escrow", createHash("sha256").update(proposal).digest("hex"), operatorRef])
    if (process.platform !== "win32") {
      expect(statSync(join(requestsDir, "secrets-escrow.passphrase.v1")).mode & 0o777).toBe(0o600)
    }
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_MAINTENANCE_ESCROW_REQUESTED")).toBe(true)
    expect(await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()).not.toContain(passphrase!)
  })

  it("hands the copy only to the administrator who made it, reports the download, and notes it on the overview", async () => {
    const { app, auth, db, requestsDir, stateDir } = setup()
    const { cookie } = await signInWithSecret(auth)
    limitedNetworks(stateDir)
    expect((await app.request("/status/maintenance/escrow/download", { headers: headers({ cookie }) })).status).toBe(404)
    offer(stateDir, "status-operator-0123456789abcdef")
    expect(await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()).toContain("made by another administrator")
    expect((await app.request("/status/maintenance/escrow/download", { headers: headers({ cookie }) })).status).toBe(403)

    const digest = offer(stateDir, operatorRef)
    expect(await (await app.request("/status/maintenance", { headers: headers({ cookie }) })).text()).toContain('href="/status/maintenance/escrow/download"')
    const download = await app.request("/status/maintenance/escrow/download", { headers: headers({ cookie }) })
    expect(download.status).toBe(200)
    expect(download.headers.get("content-disposition")).toBe('attachment; filename="lospor-hospital-secrets-20260913T085900Z.tar.gz.enc"')
    expect(download.headers.get("cache-control")).toContain("no-store")
    expect(Buffer.from(await download.arrayBuffer()).toString()).toBe("encrypted escrow bytes")
    const fields = readFileSync(join(requestsDir, MAINTENANCE_REQUEST_FILE), "utf8").trim().split("\t")
    expect([fields[1], fields[3], fields[5]]).toEqual(["secrets-escrow-delivered", digest, operatorRef])
    expect(db.getDashboard(NOW).events.some(event => event.code === "STATUS_SECRETS_ESCROW_DOWNLOADED")).toBe(true)
    expect(await (await app.request("/status/", { headers: headers({ cookie }) })).text()).toContain("A secrets escrow copy was downloaded from Status")
  })

  it("refuses a copy whose bytes differ from the offer, and one offered too long ago", async () => {
    const { app, auth, requestsDir, stateDir } = setup()
    const { cookie } = await signInWithSecret(auth)
    offer(stateDir, operatorRef)
    writeFileSync(join(stateDir, "secrets-escrow.v1.enc"), "swapped")
    expect((await app.request("/status/maintenance/escrow/download", { headers: headers({ cookie }) })).status).toBe(409)
    offer(stateDir, operatorRef)
    const current = JSON.parse(readFileSync(join(stateDir, "secrets-escrow.v1.json"), "utf8"))
    writeFileSync(join(stateDir, "secrets-escrow.v1.json"), JSON.stringify({ ...current, createdAt: new Date(NOW - 31 * 60_000).toISOString() }))
    expect((await app.request("/status/maintenance/escrow/download", { headers: headers({ cookie }) })).status).toBe(404)
    expect(existsSync(join(requestsDir, MAINTENANCE_REQUEST_FILE))).toBe(false)
  })
})
