import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { BlockList, isIP } from "node:net"
import { join } from "node:path"
import { hasExactKeys, isRecord, safeJsonParse, validIsoDate } from "./util.js"

// Maintenance from Status: back up now, run a restore drill, and change the
// site settings Status may change. Status only leaves intent for the root host
// agent (scripts/maintenance-agent-lib.sh), which checks everything again.

export type MaintenanceAction = "backup" | "drill" | "config"

export type DrillEvidence = {
  completedAt: string
  result: "passed" | "failed"
  backup: string
}

export type MaintenanceAgentSignal = {
  observedAt: string
  phase: "idle" | "accepted" | "working" | "completed" | "failed" | "needs-operator"
  resultCode: string
  lastAction?: MaintenanceAction
  drills: DrillEvidence[]
}

export type SiteSetting = { value: string | null; editable: boolean }
export type SiteConfigSignal = { settings: Record<string, SiteSetting> }

const MAX_FUTURE_SKEW_MS = 5 * 60_000
const ACTIONS: readonly MaintenanceAction[] = ["backup", "drill", "config"]

export function parseMaintenanceAgentSignal(value: unknown, now = Date.now()): MaintenanceAgentSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "phase", "resultCode", "drills"],
    ["lastAction"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "maintenance-agent"
    || !validIsoDate(value.observedAt) || Date.parse(value.observedAt) > now + MAX_FUTURE_SKEW_MS) return null
  if (!["idle", "accepted", "working", "completed", "failed", "needs-operator"].includes(String(value.phase))) return null
  if (typeof value.resultCode !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(value.resultCode)) return null
  if (value.lastAction !== undefined && !ACTIONS.includes(value.lastAction as MaintenanceAction)) return null
  if (!Array.isArray(value.drills) || value.drills.length > 10) return null
  const drills: DrillEvidence[] = []
  for (const drill of value.drills) {
    if (!isRecord(drill) || !hasExactKeys(drill, ["completedAt", "result", "backup"])) return null
    if (!validIsoDate(drill.completedAt) || (drill.result !== "passed" && drill.result !== "failed")) return null
    if (typeof drill.backup !== "string" || !/^lospor-\d{8}T\d{6}Z-[A-Za-z0-9]+\.backup$/.test(drill.backup)) return null
    drills.push({ completedAt: drill.completedAt, result: drill.result, backup: drill.backup })
  }
  return {
    observedAt: value.observedAt,
    phase: value.phase as MaintenanceAgentSignal["phase"],
    resultCode: value.resultCode,
    ...(value.lastAction === undefined ? {} : { lastAction: value.lastAction as MaintenanceAction }),
    drills,
  }
}

export function parseSiteConfigSignal(value: unknown): SiteConfigSignal | null {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "signalType", "settings"])) return null
  if (value.schemaVersion !== 1 || value.signalType !== "site-config" || !isRecord(value.settings)) return null
  const settings: Record<string, SiteSetting> = {}
  for (const [key, setting] of Object.entries(value.settings)) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key) || !isRecord(setting) || !hasExactKeys(setting, ["value", "editable"])) return null
    if ((setting.value !== null && typeof setting.value !== "string") || typeof setting.editable !== "boolean") return null
    if (typeof setting.value === "string" && (setting.value.length > 512 || /["\\\p{Cc}]/u.test(setting.value))) return null
    settings[key] = { value: setting.value, editable: setting.editable }
  }
  return { settings }
}

async function readStateJson(path: string): Promise<unknown> {
  try {
    const text = await readFile(path, "utf8")
    return Buffer.byteLength(text) > 8192 ? null : safeJsonParse(text)
  } catch {
    return null
  }
}

export async function readMaintenanceAgentSignal(stateDir: string, now = Date.now()) {
  return parseMaintenanceAgentSignal(await readStateJson(join(stateDir, "maintenance-agent.v1.json")), now)
}

export async function readSiteConfigSignal(stateDir: string) {
  return parseSiteConfigSignal(await readStateJson(join(stateDir, "site-config.v1.json")))
}

// ── the settings Status may change ──────────────────────────────────────────
//
// The same set the agent enforces (MAINTENANCE_STATUS_KEYS). Names, certificate
// mode and ports change the address this page is reached at, and the switch
// that opens every private network is too broad for a web form: those stay at
// the console.

export type EditableSetting = {
  key: string
  en: string
  bg: string
  kind: "locale" | "email" | "optional-email" | "name" | "support" | "cidrs" | "supply" | "time" | "timezone"
}

export const EDITABLE_SETTINGS: readonly EditableSetting[] = [
  { key: "HOSPITAL_STATUS_ALLOWED_CIDRS", en: "Networks that may open Status", bg: "Мрежи с достъп до Status", kind: "cidrs" },
  { key: "HOSPITAL_RESEARCH_ALLOWED_CIDRS", en: "Networks that may open Research", bg: "Мрежи с достъп до изследванията", kind: "cidrs" },
  { key: "HOSPITAL_SUPPORT_URL", en: "Support contact for clinicians", bg: "Контакт за поддръжка на клиницистите", kind: "support" },
  { key: "AUTH_EMAIL_FROM", en: "Sender address of sign-in e-mails", bg: "Адрес на подателя на писмата за вход", kind: "email" },
  { key: "AUTH_EMAIL_FROM_NAME", en: "Sender name of sign-in e-mails", bg: "Име на подателя на писмата за вход", kind: "name" },
  { key: "ACME_EMAIL", en: "Certificate notice e-mail", bg: "Имейл за известия за сертификата", kind: "optional-email" },
  { key: "LOSPOR_DEFAULT_LOCALE", en: "Default language", bg: "Език по подразбиране", kind: "locale" },
  { key: "HOSPITAL_UPDATE_SUPPLY_MODE", en: "Update route", bg: "Път за обновяване", kind: "supply" },
  { key: "HOSPITAL_UPDATE_WINDOW_START", en: "Update window opens", bg: "Начало на прозореца за обновяване", kind: "time" },
  { key: "HOSPITAL_UPDATE_WINDOW_END", en: "Update window closes", bg: "Край на прозореца за обновяване", kind: "time" },
  { key: "HOSPITAL_UPDATE_TIMEZONE", en: "Update window time zone", bg: "Часова зона на прозореца", kind: "timezone" },
]

const EMAIL = /^[A-Za-z0-9.!#%&*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

function validCidr(entry: string): boolean {
  const slash = entry.indexOf("/")
  const address = slash < 0 ? entry : entry.slice(0, slash)
  const family = isIP(address)
  if (family === 0) return false
  if (slash < 0) return true
  const prefix = entry.slice(slash + 1)
  if (!/^\d{1,3}$/.test(prefix)) return false
  return Number(prefix) <= (family === 4 ? 32 : 128)
}

function cidrEntries(value: string): string[] {
  return value.split(/\s+/).filter(Boolean)
}

/** True when `address` falls inside any entry of a space-separated list. */
export function cidrListContains(list: string, address: string): boolean {
  const family = isIP(address)
  if (family === 0) return false
  const blocks = new BlockList()
  for (const entry of cidrEntries(list)) {
    if (!validCidr(entry)) continue
    const [network, prefix] = entry.split("/")
    const networkFamily = isIP(network!) === 4 ? "ipv4" : "ipv6"
    if (prefix === undefined) blocks.addAddress(network!, networkFamily)
    else blocks.addSubnet(network!, Number(prefix), networkFamily)
  }
  if (blocks.check(address, family === 4 ? "ipv4" : "ipv6")) return true
  // An IPv4 client seen through an IPv6 socket.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1]
  return mapped !== undefined && blocks.check(mapped, "ipv4")
}

/** A first check for the form. The host validates every value again. */
export function validSettingValue(setting: EditableSetting, value: string): boolean {
  // Nothing that site.env, a shell or JSON would read as anything but text.
  if (value.length > 300 || /["'\\`$\p{Cc}]/u.test(value)) return false
  switch (setting.kind) {
    case "locale": return value === "bg" || value === "en"
    case "email": return EMAIL.test(value)
    case "optional-email": return value === "" || EMAIL.test(value)
    case "name": return /^[\p{L}\p{N} .,&()-]{1,64}$/u.test(value)
    case "support":
      return value === "" || (/^https:\/\/[^\s@/]+(\/\S*)?$/.test(value) && value.length <= 300)
        || (value.startsWith("mailto:") && EMAIL.test(value.slice(7)))
    case "cidrs": {
      const entries = cidrEntries(value)
      return entries.length > 0 && entries.length <= 32 && entries.every(validCidr)
        && !entries.some(entry => /^(0\.0\.0\.0|::)\/0$/.test(entry))
    }
    case "supply": return value === "connected" || value === "offline"
    case "time": return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    case "timezone": return /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)+$/.test(value) && value.length <= 64
  }
}

export type SettingChange = { key: string; before: string; after: string }

export type SettingsProposal = {
  content: string
  sha256: string
  changes: SettingChange[]
}

/**
 * The complete site.env Status proposes: every setting the host reported, in
 * its order, with only the editable ones replaced. Returns null while any value
 * could not be reported faithfully, so nothing is guessed.
 */
export function buildSettingsProposal(
  current: SiteConfigSignal,
  submitted: Record<string, string>,
): SettingsProposal | null {
  if (Object.values(current.settings).some(setting => setting.value === null)) return null
  const editable = new Map(EDITABLE_SETTINGS.map(setting => [setting.key, setting]))
  const lines: string[] = []
  const changes: SettingChange[] = []
  const line = (key: string, value: string) =>
    lines.push(key.endsWith("_CIDRS") || /\s/.test(value) ? `${key}="${value}"` : `${key}=${value}`)
  for (const [key, setting] of Object.entries(current.settings)) {
    const before = setting.value ?? ""
    const after = editable.has(key) && setting.editable && submitted[key] !== undefined ? submitted[key]! : before
    if (after !== before) changes.push({ key, before, after })
    line(key, after)
  }
  for (const setting of EDITABLE_SETTINGS) {
    const after = submitted[setting.key]
    if (current.settings[setting.key] !== undefined || after === undefined || after === "") continue
    changes.push({ key: setting.key, before: "", after })
    line(setting.key, after)
  }
  const content = `${lines.join("\n")}\n`
  return { content, sha256: createHash("sha256").update(content).digest("hex"), changes }
}
