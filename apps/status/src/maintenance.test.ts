import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  EDITABLE_SETTINGS,
  buildSettingsProposal,
  cidrListContains,
  parseMaintenanceAgentSignal,
  parseSiteConfigSignal,
  validSettingValue,
  type SiteConfigSignal,
} from "./maintenance.js"
import { MAINTENANCE_REQUEST_FILE, SITE_CONFIG_PROPOSAL_FILE, submitMaintenanceRequest } from "./update-requests.js"

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
