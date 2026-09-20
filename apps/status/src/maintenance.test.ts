import { createHash, randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  EDITABLE_SETTINGS,
  buildAdvancedProposal,
  buildOffhostProposal,
  buildSettingsProposal,
  cidrListContains,
  generateEscrowPassphrase,
  networkListsState,
  offhostDestinationFromForm,
  parseOffhostSignal,
  parseMaintenanceAgentSignal,
  parseSecretsEscrowOffer,
  parseSiteConfigSignal,
  readSecretsEscrowBundle,
  validSettingValue,
  type SiteConfigSignal,
} from "./maintenance.js"
import { MAINTENANCE_REQUEST_FILE, SECRETS_ESCROW_PROPOSAL_FILE, SITE_CONFIG_PROPOSAL_FILE, submitMaintenanceRequest } from "./update-requests.js"

const NOW = Date.parse("2026-09-13T09:00:00Z")
const OPERATOR = "status-operator-0123456789abcdef"
const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

const setting = (key: string) => EDITABLE_SETTINGS.find(entry => entry.key === key)!

const current: SiteConfigSignal = {
  settings: {
    LOSPOR_DEFAULT_LOCALE: { value: "bg", editable: true },
    HOSPITAL_CLINICAL_DOMAIN: { value: "clinical.example.org", editable: false },
    HOSPITAL_STATUS_ALLOWED_CIDRS: { value: "10.20.40.0/24", editable: true },
    HOSPITAL_SUPPORT_URL: { value: "", editable: true },
    AUTH_EMAIL_FROM_NAME: { value: "LOSPOR", editable: true },
  },
}

describe("the maintenance projection", () => {
  const signal = (over: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    signalType: "maintenance-agent",
    observedAt: "2026-09-13T08:59:00Z",
    phase: "completed",
    resultCode: "MAINTENANCE_DRILL_PASSED",
    lastAction: "drill",
    drills: [{ completedAt: "2026-09-13T08:58:00Z", result: "passed", backup: "lospor-20260913T072635Z-W3UVqwGn.backup" }],
    ...over,
  })

  it("accepts exactly the documented fields", () => {
    expect(parseMaintenanceAgentSignal(signal(), NOW)?.drills).toHaveLength(1)
  })

  it.each([
    ["an extra field", { path: "/opt/lospor-hospital" }],
    ["an unknown action", { lastAction: "restore" }],
    ["a drill naming a path", { drills: [{ completedAt: "2026-09-13T08:58:00Z", result: "passed", backup: "../secrets" }] }],
    ["a future observation", { observedAt: "2026-09-13T10:00:00Z" }],
  ])("refuses %s", (_label, over) => {
    expect(parseMaintenanceAgentSignal(signal(over), NOW)).toBeNull()
  })

  it("refuses a site setting that carries a quote or an unknown field", () => {
    expect(parseSiteConfigSignal({ schemaVersion: 1, signalType: "site-config", settings: { A_KEY: { value: "x\"y", editable: true } } })).toBeNull()
    expect(parseSiteConfigSignal({ schemaVersion: 1, signalType: "site-config", settings: { A_KEY: { value: "x", editable: true, secret: "y" } } })).toBeNull()
    expect(parseSiteConfigSignal({ schemaVersion: 1, signalType: "site-config", settings: { A_KEY: { value: null, editable: false } } }))
      .toEqual({ settings: { A_KEY: { value: null, editable: false } } })
  })
})

describe("validating a setting", () => {
  it.each([
    ["HOSPITAL_STATUS_ALLOWED_CIDRS", "10.20.40.0/24 2001:db8:40::/64", true],
    ["HOSPITAL_STATUS_ALLOWED_CIDRS", "0.0.0.0/0", false],
    ["HOSPITAL_STATUS_ALLOWED_CIDRS", "10.20.40.0/33", false],
    ["HOSPITAL_STATUS_ALLOWED_CIDRS", "", false],
    ["HOSPITAL_SUPPORT_URL", "", true],
    ["HOSPITAL_SUPPORT_URL", "mailto:it@example.org", true],
    ["HOSPITAL_SUPPORT_URL", "https://help.example.org/lospor", true],
    ["HOSPITAL_SUPPORT_URL", "http://help.example.org", false],
    ["HOSPITAL_SUPPORT_URL", "https://user:pass@help.example.org", false],
    ["AUTH_EMAIL_FROM_NAME", "LOSPOR $(reboot)", false],
    ["AUTH_EMAIL_FROM_NAME", "Болница Света Анна", true],
    ["HOSPITAL_UPDATE_WINDOW_START", "24:00", false],
    ["HOSPITAL_UPDATE_TIMEZONE", "Europe/Sofia", true],
    ["HOSPITAL_UPDATE_TIMEZONE", "../../etc/passwd", false],
    // Blank, for the keys a fresh install genuinely leaves unset. The host
    // accepts all three (apply-site-config.sh: `[ -z "$window" ] ||`,
    // `[ -z "$timezone" ] ||`, `''|manual|window`), so refusing them here left
    // a new appliance unable to save its own settings form at all.
    ["HOSPITAL_UPDATE_WINDOW_START", "", true],
    ["HOSPITAL_UPDATE_WINDOW_END", "", true],
    ["HOSPITAL_UPDATE_TIMEZONE", "", true],
    ["HOSPITAL_HOST_REBOOT_POLICY", "", true],
    ["HOSPITAL_HOST_REBOOT_POLICY", "manual", true],
    ["HOSPITAL_HOST_REBOOT_POLICY", "sometimes", false],
    // The two the host does not accept blank stay refused.
    ["LOSPOR_DEFAULT_LOCALE", "", false],
    ["LOSPOR_DEFAULT_LOCALE", "Bg", false],
    ["HOSPITAL_UPDATE_SUPPLY_MODE", "", false],
    ["HOSPITAL_UPDATE_SUPPLY_MODE", "Connected", false],
  ])("%s = %j is %s", (key, value, valid) => {
    expect(validSettingValue(setting(key), value)).toBe(valid)
  })

  it("knows whether an address is inside a network list", () => {
    expect(cidrListContains("10.20.40.0/24 2001:db8:40::/64", "10.20.40.7")).toBe(true)
    expect(cidrListContains("10.20.40.0/24", "::ffff:10.20.40.7")).toBe(true)
    expect(cidrListContains("10.20.40.0/24 2001:db8:40::/64", "2001:db8:40::9")).toBe(true)
    expect(cidrListContains("10.20.40.0/24", "10.20.41.7")).toBe(false)
    expect(cidrListContains("10.20.40.0/24", "local")).toBe(false)
  })
})

describe("building a settings proposal", () => {
  it("replaces only editable settings, keeps order, and quotes network lists", () => {
    const proposal = buildSettingsProposal(current, {
      HOSPITAL_SUPPORT_URL: "mailto:it@example.org",
      HOSPITAL_STATUS_ALLOWED_CIDRS: "10.20.40.0/24",
      HOSPITAL_CLINICAL_DOMAIN: "attacker.example",
      AUTH_EMAIL_FROM_NAME: "LOSPOR Hospital",
    })!
    expect(proposal.content).toBe([
      "LOSPOR_DEFAULT_LOCALE=bg",
      "HOSPITAL_CLINICAL_DOMAIN=clinical.example.org",
      'HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.40.0/24"',
      "HOSPITAL_SUPPORT_URL=mailto:it@example.org",
      'AUTH_EMAIL_FROM_NAME="LOSPOR Hospital"',
      "",
    ].join("\n"))
    expect(proposal.changes.map(change => change.key)).toEqual(["HOSPITAL_SUPPORT_URL", "AUTH_EMAIL_FROM_NAME"])
    expect(proposal.sha256).toBe(createHash("sha256").update(proposal.content).digest("hex"))
  })

  it("adds a setting the host did not have only when it is given a value", () => {
    expect(buildSettingsProposal(current, { HOSPITAL_UPDATE_WINDOW_START: "" })!.changes).toEqual([])
    expect(buildSettingsProposal(current, { HOSPITAL_UPDATE_WINDOW_START: "21:00" })!.content)
      .toContain("HOSPITAL_UPDATE_WINDOW_START=21:00\n")
  })

  it("turns the all-private-networks switch off once neither list needs it, and never on", () => {
    const installed: SiteConfigSignal = { settings: {
      HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE: { value: "confirmed", editable: false },
      HOSPITAL_RESEARCH_ALLOWED_CIDRS: { value: "127.0.0.1/32", editable: true },
      HOSPITAL_STATUS_ALLOWED_CIDRS: { value: "10.0.0.0/8 172.16.0.0/12 192.168.0.0/16", editable: true },
    } }
    expect(networkListsState(installed)).toEqual({ statusOpenToAllPrivate: true, researchClosed: true })
    const researchOnly = buildSettingsProposal(installed, { HOSPITAL_RESEARCH_ALLOWED_CIDRS: "10.20.30.0/24" })!
    expect(researchOnly.content).toContain("HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE=confirmed\n")
    const narrowed = buildSettingsProposal(installed, { HOSPITAL_STATUS_ALLOWED_CIDRS: "10.20.40.0/24" })!
    expect(narrowed.content).toContain("HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE=\n")
    expect(narrowed.changes.map(change => change.key)).toEqual(["HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE", "HOSPITAL_STATUS_ALLOWED_CIDRS"])
    expect(buildSettingsProposal({ settings: { ...installed.settings, HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE: { value: "", editable: false } } },
      { HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE: "confirmed" })!.changes).toEqual([])
    expect(networkListsState(null)).toBeNull()
  })

  it("refuses to build anything while a host value could not be reported exactly", () => {
    expect(buildSettingsProposal({ settings: { ...current.settings, AUTH_EMAIL_FROM: { value: null, editable: true } } }, {})).toBeNull()
  })
})

describe("leaving maintenance intent", () => {
  const workspace = () => {
    const dir = mkdtempSync(join(tmpdir(), "lospor-maintenance-"))
    dirs.push(dir)
    return dir
  }

  it("writes one fixed-field request, and a second waits for the first", async () => {
    const dir = workspace()
    expect(await submitMaintenanceRequest(dir, { requestId: "a".repeat(32), action: "drill", operatorRef: OPERATOR }, NOW)).toBe("submitted")
    expect(readFileSync(join(dir, MAINTENANCE_REQUEST_FILE), "utf8"))
      .toBe(`LOSPOR-HOSPITAL-MAINTENANCE-REQUEST-V1\tdrill\t${"a".repeat(32)}\t-\t${NOW / 1000}\t${OPERATOR}\n`)
    expect(await submitMaintenanceRequest(dir, { requestId: "b".repeat(32), action: "backup", operatorRef: OPERATOR }, NOW)).toBe("already-pending")
  })

  it("writes the proposal the request names, byte for byte", async () => {
    const dir = workspace()
    const proposal = buildSettingsProposal(current, { HOSPITAL_SUPPORT_URL: "mailto:it@example.org" })!
    writeFileSync(join(dir, SITE_CONFIG_PROPOSAL_FILE), "left over from a failed publication\n")
    expect(await submitMaintenanceRequest(dir, {
      requestId: "c".repeat(32), action: "config", operatorRef: OPERATOR, proposal: { content: proposal.content, sha256: proposal.sha256 },
    }, NOW)).toBe("submitted")
    const written = readFileSync(join(dir, SITE_CONFIG_PROPOSAL_FILE), "utf8")
    expect(createHash("sha256").update(written).digest("hex")).toBe(proposal.sha256)
    expect(readFileSync(join(dir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[3]).toBe(proposal.sha256)
    expect(readdirSync(dir).sort()).toEqual([MAINTENANCE_REQUEST_FILE, SITE_CONFIG_PROPOSAL_FILE].sort())
  })

  it("refuses a proposal whose digest does not match, or a proposal on a backup", async () => {
    const dir = workspace()
    await expect(submitMaintenanceRequest(dir, {
      requestId: "d".repeat(32), action: "config", operatorRef: OPERATOR, proposal: { content: "A=1\n", sha256: "e".repeat(64) },
    }, NOW)).rejects.toThrow()
    await expect(submitMaintenanceRequest(dir, {
      requestId: "d".repeat(32), action: "backup", operatorRef: OPERATOR, proposal: { content: "A=1\n", sha256: createHash("sha256").update("A=1\n").digest("hex") },
    }, NOW)).rejects.toThrow()
    expect(readdirSync(dir)).toEqual([])
  })
})

describe("the off-host projection and destination", () => {
  const signal = {
    schemaVersion: 1,
    signalType: "offhost",
    observedAt: "2026-09-13T08:59:00Z",
    destination: { type: "sftp", host: "127.0.0.1", port: 22, user: "offhost", directory: "lospor-backups" },
    sshPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILEGRRwahtYCtDjvfHPauq9loMXBk9YV5MttcPoLnVhV",
    hostKeyFingerprints: ["SHA256:hXX1vE8kygq7WwC/7qqqV95G+/hAAFK/kH370JphmHo"],
    encryptionKeyFingerprint: "d9f6f5b437cdf812",
    lastRun: { at: "2026-09-13T08:58:00Z", result: "OFFHOST_COPY_ACKNOWLEDGED" },
    drills: [{ completedAt: "2026-09-13T08:58:30Z", result: "passed", backup: "lospor-20260913T072635Z-W3UVqwGn.backup" }],
  }

  it("accepts what the host writes", () => {
    expect(parseOffhostSignal(signal, NOW)?.destination).toEqual(signal.destination)
  })

  it.each([
    // Assembled here so the distribution scan never sees a key marker in source.
    ["a private key", { sshPublicKey: ["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" ") }],
    ["a full encryption key", { encryptionKeyFingerprint: "a".repeat(64) }],
    ["an extra field", { password: "x" }],
    ["a destination inside the appliance", { destination: { type: "mount", path: "/opt/lospor-hospital/backups" } }],
    ["free text as a result", { lastRun: { at: "2026-09-13T08:58:00Z", result: "copied to \\server" } }],
  ])("refuses %s", (_label, over) => {
    expect(parseOffhostSignal({ ...signal, ...over }, NOW)).toBeNull()
  })

  it("builds the fixed-field proposal the host accepts, and refuses an unsafe form", () => {
    expect(offhostDestinationFromForm({ type: "sftp", host: "backup.hospital.test", port: "", user: "lospor", directory: "lospor-backups" }))
      .toEqual({ type: "sftp", host: "backup.hospital.test", port: 22, user: "lospor", directory: "lospor-backups" })
    expect(buildOffhostProposal({ type: "mount", path: "/mnt/lospor-backups" }).content).toBe("type=mount\npath=/mnt/lospor-backups\n")
    for (const form of [
      { type: "mount", path: "relative" },
      { type: "mount", path: "/mnt/../etc" },
      { type: "sftp", host: "-oProxyCommand=sh", port: "22", user: "lospor", directory: "x" },
      { type: "sftp", host: "backup", port: "70000", user: "lospor", directory: "x" },
      { type: "sftp", host: "backup", port: "22", user: "lospor\nroot", directory: "x" },
      { type: "ftp", host: "backup" },
    ]) {
      expect(offhostDestinationFromForm(form)).toBeNull()
    }
  })
})

describe("advanced settings proposals", () => {
  const current = parseSiteConfigSignal({
    schemaVersion: 1,
    signalType: "site-config",
    settings: {},
    advanced: {
      HOSPITAL_BACKUP_INTERVAL_SECONDS: { value: 5400, minimum: 3600, maximum: 14400, default: 14400, overridden: true },
      HOSPITAL_BACKUP_RESERVE_BYTES: { value: 5368709120, minimum: 1073741824, maximum: 536870912000, default: 5368709120, overridden: false },
    },
  })!

  it("keeps a value nobody touched, even one that is not a whole number of hours", () => {
    const proposal = buildAdvancedProposal(current, { HOSPITAL_BACKUP_INTERVAL_SECONDS: "1.5", HOSPITAL_BACKUP_RESERVE_BYTES: "5" })
    expect(proposal).toMatchObject({
      changes: [],
      content: "# Advanced settings proposed from Status.\nHOSPITAL_BACKUP_INTERVAL_SECONDS=5400\n",
    })
  })

  it("converts people's units, writes only values that differ from the default, and refuses anything outside the limits", () => {
    expect(buildAdvancedProposal(current, { HOSPITAL_BACKUP_INTERVAL_SECONDS: "4", HOSPITAL_BACKUP_RESERVE_BYTES: "20" })).toMatchObject({
      changes: [
        { key: "HOSPITAL_BACKUP_INTERVAL_SECONDS", before: "5400", after: "14400" },
        { key: "HOSPITAL_BACKUP_RESERVE_BYTES", before: "5368709120", after: "21474836480" },
      ],
      content: "# Advanced settings proposed from Status.\nHOSPITAL_BACKUP_RESERVE_BYTES=21474836480\n",
    })
    expect(buildAdvancedProposal(current, { HOSPITAL_BACKUP_INTERVAL_SECONDS: "6" })).toEqual({ invalid: ["HOSPITAL_BACKUP_INTERVAL_SECONDS"] })
    expect(buildAdvancedProposal(current, { HOSPITAL_BACKUP_RESERVE_BYTES: "1e3" })).toEqual({ invalid: ["HOSPITAL_BACKUP_RESERVE_BYTES"] })
  })

  it("refuses a report whose value is not a whole number, and proposes nothing without a report", () => {
    expect(parseSiteConfigSignal({
      schemaVersion: 1,
      signalType: "site-config",
      settings: {},
      advanced: { HOSPITAL_BACKUP_DAILY_POINTS: { value: "14", minimum: 14, maximum: 90, default: 14, overridden: false } },
    })).toBeNull()
    expect(buildAdvancedProposal({ settings: {} }, {})).toBeNull()
  })
})

describe("the secrets escrow offer and request", () => {
  const bytes = Buffer.from("encrypted")
  const offer = {
    schemaVersion: 1, signalType: "secrets-escrow", createdAt: "2026-09-13T08:59:00Z",
    fileName: "lospor-hospital-secrets-20260913T085900Z.tar.gz.enc",
    sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, operatorRef: OPERATOR,
  }

  it("accepts only an exact, recent offer", () => {
    expect(parseSecretsEscrowOffer(offer, NOW)?.fileName).toBe(offer.fileName)
    expect(parseSecretsEscrowOffer({ ...offer, createdAt: "2026-09-13T08:29:00Z" }, NOW)).toBeNull()
    expect(parseSecretsEscrowOffer({ ...offer, fileName: "../secrets.tar.gz.enc" }, NOW)).toBeNull()
    expect(parseSecretsEscrowOffer({ ...offer, extra: true }, NOW)).toBeNull()
    expect(parseSecretsEscrowOffer({ ...offer, operatorRef: "someone" }, NOW)).toBeNull()
  })

  it("hands out the bytes only when they are the ones offered", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lospor-status-escrow-"))
    dirs.push(dir)
    writeFileSync(join(dir, "secrets-escrow.v1.enc"), bytes)
    const parsed = parseSecretsEscrowOffer(offer, NOW)!
    expect((await readSecretsEscrowBundle(dir, parsed))?.toString()).toBe("encrypted")
    writeFileSync(join(dir, "secrets-escrow.v1.enc"), "changed!!")
    expect(await readSecretsEscrowBundle(dir, parsed)).toBeNull()
  })

  it("generates six groups of five unambiguous characters", () => {
    const passphrase = generateEscrowPassphrase(randomBytes)
    expect(passphrase).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{5}(-[abcdefghjkmnpqrstuvwxyz23456789]{5}){5}$/)
    expect(generateEscrowPassphrase(randomBytes)).not.toBe(passphrase)
    // Bytes 248 and above would bias the alphabet, so they are skipped.
    let calls = 0
    expect(generateEscrowPassphrase(size => Buffer.alloc(size, calls++ === 0 ? 255 : 0))).toBe("aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa")
  })

  it("requires the passphrase with the escrow request, and the copy's digest with the download report", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lospor-status-escrow-request-"))
    dirs.push(dir)
    const content = "abcde-fghjk-mnpqr-stuvw-xyz23-45678\n"
    const digest = createHash("sha256").update(content).digest("hex")
    await expect(submitMaintenanceRequest(dir, { requestId: "a".repeat(32), action: "secrets-escrow", operatorRef: OPERATOR }, NOW)).rejects.toThrow()
    await expect(submitMaintenanceRequest(dir, { requestId: "a".repeat(32), action: "secrets-escrow-delivered", operatorRef: OPERATOR, delivered: "x" }, NOW)).rejects.toThrow()
    await expect(submitMaintenanceRequest(dir, { requestId: "a".repeat(32), action: "backup", operatorRef: OPERATOR, delivered: "a".repeat(64) }, NOW)).rejects.toThrow()
    expect(await submitMaintenanceRequest(dir, {
      requestId: "a".repeat(32), action: "secrets-escrow", operatorRef: OPERATOR, proposal: { content, sha256: digest },
    }, NOW)).toBe("submitted")
    expect(readFileSync(join(dir, SECRETS_ESCROW_PROPOSAL_FILE), "utf8")).toBe(content)
    expect(readFileSync(join(dir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t")[3]).toBe(digest)
    if (process.platform !== "win32") expect(statSync(join(dir, SECRETS_ESCROW_PROPOSAL_FILE)).mode & 0o777).toBe(0o600)
    rmSync(join(dir, MAINTENANCE_REQUEST_FILE))
    expect(await submitMaintenanceRequest(dir, {
      requestId: "b".repeat(32), action: "secrets-escrow-delivered", operatorRef: OPERATOR, delivered: "c".repeat(64),
    }, NOW)).toBe("submitted")
    expect(readFileSync(join(dir, MAINTENANCE_REQUEST_FILE), "utf8").split("\t").slice(1, 4)).toEqual(["secrets-escrow-delivered", "b".repeat(32), "c".repeat(64)])
  })
})
