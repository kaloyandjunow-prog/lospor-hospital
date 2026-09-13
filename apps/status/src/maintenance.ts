import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { BlockList, isIP } from "node:net"
import { join } from "node:path"
import { hasExactKeys, isRecord, safeJsonParse, validIsoDate } from "./util.js"

// Maintenance from Status: back up now, run a restore drill, and change the
// site settings Status may change. Status only leaves intent for the root host
// agent (scripts/maintenance-agent-lib.sh), which checks everything again.

export type MaintenanceAction = "backup" | "drill" | "config" | "advanced" | "offhost-config" | "offhost-test" | "offhost-drill" | "offhost-disable" | "os-update" | "os-reboot" | "support-bundle" | "rotate-credentials"

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
/** A tuning value in effect, its limits and default, and whether advanced.env overrides it. */
export type AdvancedSetting = { value: number; minimum: number; maximum: number; default: number; overridden: boolean }
export type SiteConfigSignal = { settings: Record<string, SiteSetting>; advanced?: Record<string, AdvancedSetting> }

const MAX_FUTURE_SKEW_MS = 5 * 60_000
const ACTIONS: readonly MaintenanceAction[] = ["backup", "drill", "config", "advanced", "offhost-config", "offhost-test", "offhost-drill", "offhost-disable", "os-update", "os-reboot", "support-bundle", "rotate-credentials"]

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
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "signalType", "settings"], ["advanced"])) return null
  if (value.schemaVersion !== 1 || value.signalType !== "site-config" || !isRecord(value.settings)) return null
  const settings: Record<string, SiteSetting> = {}
  for (const [key, setting] of Object.entries(value.settings)) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key) || !isRecord(setting) || !hasExactKeys(setting, ["value", "editable"])) return null
    if ((setting.value !== null && typeof setting.value !== "string") || typeof setting.editable !== "boolean") return null
    if (typeof setting.value === "string" && (setting.value.length > 512 || /["\\\p{Cc}]/u.test(setting.value))) return null
    settings[key] = { value: setting.value, editable: setting.editable }
  }
  if (value.advanced === undefined) return { settings }
  if (!isRecord(value.advanced)) return null
  const advanced: Record<string, AdvancedSetting> = {}
  const whole = (item: unknown): item is number => typeof item === "number" && Number.isSafeInteger(item) && item >= 0
  for (const [key, setting] of Object.entries(value.advanced)) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key) || !isRecord(setting)
      || !hasExactKeys(setting, ["value", "minimum", "maximum", "default", "overridden"])) return null
    if (!whole(setting.value) || !whole(setting.minimum) || !whole(setting.maximum) || !whole(setting.default)
      || typeof setting.overridden !== "boolean" || setting.minimum > setting.maximum) return null
    advanced[key] = {
      value: setting.value, minimum: setting.minimum, maximum: setting.maximum,
      default: setting.default, overridden: setting.overridden,
    }
  }
  return { settings, advanced }
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
  kind: "locale" | "email" | "optional-email" | "name" | "support" | "cidrs" | "supply" | "time" | "timezone" | "reboot-policy"
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
  { key: "HOSPITAL_HOST_REBOOT_POLICY", en: "Restart after Ubuntu updates (manual or window)", bg: "Рестартиране след обновления на Ubuntu (manual или window)", kind: "reboot-policy" },
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

// The installer no longer asks for the network lists. Until Hospital IT sets
// them here, Status answers every private network (with the console switch
// HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE=confirmed) and Research answers nobody.
export const ALL_PRIVATE_NETWORKS = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"] as const
export const RESEARCH_CLOSED = "127.0.0.1/32"

export function coversAllPrivateNetworks(list: string): boolean {
  const entries = cidrEntries(list)
  return ALL_PRIVATE_NETWORKS.every(network => entries.includes(network))
}

export type NetworkListsState = { statusOpenToAllPrivate: boolean; researchClosed: boolean }

/** Null while the host has not reported both lists. */
export function networkListsState(siteConfig: SiteConfigSignal | null): NetworkListsState | null {
  const status = siteConfig?.settings.HOSPITAL_STATUS_ALLOWED_CIDRS?.value
  const research = siteConfig?.settings.HOSPITAL_RESEARCH_ALLOWED_CIDRS?.value
  if (typeof status !== "string" || typeof research !== "string") return null
  return {
    statusOpenToAllPrivate: coversAllPrivateNetworks(status),
    researchClosed: cidrEntries(research).every(entry => entry === RESEARCH_CLOSED),
  }
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
    case "reboot-policy": return value === "manual" || value === "window"
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
  const proposed = (key: string) => {
    const setting = current.settings[key]
    return setting?.editable && submitted[key] !== undefined ? submitted[key]! : setting?.value ?? ""
  }
  // Once neither list opens every private network, the switch that allowed it
  // is turned off with the same change. Status may only ever turn it off.
  const closeAllPrivate = current.settings.HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE?.value === "confirmed"
    && !coversAllPrivateNetworks(proposed("HOSPITAL_STATUS_ALLOWED_CIDRS"))
    && !coversAllPrivateNetworks(proposed("HOSPITAL_RESEARCH_ALLOWED_CIDRS"))
  for (const [key, setting] of Object.entries(current.settings)) {
    const before = setting.value ?? ""
    const after = key === "HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE" && closeAllPrivate ? ""
      : editable.has(key) && setting.editable && submitted[key] !== undefined ? submitted[key]! : before
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

// ── advanced settings ────────────────────────────────────────────────────────
//
// Tuning values with fixed limits (ADVANCED_CONFIG_SPEC in site-config.sh). The
// host reports each value with its limits and default, so this list only names
// them for people and says which unit to show: nobody should have to think in
// seconds or bytes. The host checks every value again.

export type AdvancedUnit = "hours" | "minutes" | "days" | "gib" | "percent" | "count"

export type AdvancedSettingLabel = {
  key: string
  en: string
  bg: string
  unit: AdvancedUnit
  /** How many of the stored unit make one shown unit. */
  factor: number
}

export const ADVANCED_SETTINGS: readonly AdvancedSettingLabel[] = [
  { key: "HOSPITAL_BACKUP_INTERVAL_SECONDS", en: "Take a backup every", bg: "Архив на всеки", unit: "hours", factor: 3600 },
  { key: "HOSPITAL_BACKUP_RETRY_SECONDS", en: "After a failed backup, try again after", bg: "След неуспешен архив, нов опит след", unit: "minutes", factor: 60 },
  { key: "HOSPITAL_BACKUP_KEEP_ALL_SECONDS", en: "Keep every backup for", bg: "Всеки архив се пази", unit: "days", factor: 86400 },
  { key: "HOSPITAL_BACKUP_DAILY_POINTS", en: "Then keep one backup a day for", bg: "След това по един архив на ден за", unit: "days", factor: 1 },
  { key: "HOSPITAL_BACKUP_RESERVE_BYTES", en: "Disk space backups always leave free", bg: "Свободно място, което архивите винаги оставят", unit: "gib", factor: 1024 ** 3 },
  { key: "HOSPITAL_BACKUP_SPACE_MULTIPLIER_PERCENT", en: "Free space needed for a new backup, as a share of the last one", bg: "Нужно свободно място за нов архив, спрямо размера на последния", unit: "percent", factor: 1 },
  { key: "RESEARCH_EXPORT_RETENTION_DAYS", en: "Keep research export files for", bg: "Файловете с изследователски експорти се пазят", unit: "days", factor: 1 },
  { key: "HOSPITAL_EXPORT_RETAIN_ACCEPTED_DAYS", en: "Keep batches Central accepted for", bg: "Пакетите, приети от Central, се пазят", unit: "days", factor: 1 },
  { key: "HOSPITAL_EXPORT_BATCH_CASE_LIMIT", en: "Cases in one batch to Central", bg: "Случаи в един пакет към Central", unit: "count", factor: 1 },
  { key: "HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS", en: "Check for a new release every", bg: "Проверка за нова версия на всеки", unit: "hours", factor: 3600 },
]

/** A stored value in the unit people see, without rounding it away. */
export function advancedDisplayValue(label: AdvancedSettingLabel, value: number): string {
  const shown = value / label.factor
  return Number.isInteger(shown) ? String(shown) : String(Math.round(shown * 1000) / 1000)
}

export type AdvancedProposal = {
  content: string
  sha256: string
  changes: SettingChange[]
}

/**
 * The complete advanced.env Status proposes: one line for every value that is
 * not its default, whatever was typed for the others. Returns the keys that
 * are not valid instead, or null when the host has not reported the settings.
 */
export function buildAdvancedProposal(
  current: SiteConfigSignal,
  submitted: Record<string, string>,
): AdvancedProposal | { invalid: string[] } | null {
  if (!current.advanced) return null
  const invalid: string[] = []
  const lines: string[] = []
  const changes: SettingChange[] = []
  for (const label of ADVANCED_SETTINGS) {
    const setting = current.advanced[label.key]
    if (!setting) continue
    const typed = submitted[label.key]
    let after = setting.value
    if (typed !== undefined && typed !== advancedDisplayValue(label, setting.value)) {
      if (!/^\d{1,9}(\.\d{1,3})?$/.test(typed)) {
        invalid.push(label.key)
        continue
      }
      after = Math.round(Number(typed) * label.factor)
    }
    if (!Number.isSafeInteger(after) || after < setting.minimum || after > setting.maximum) {
      invalid.push(label.key)
      continue
    }
    if (after !== setting.value) changes.push({ key: label.key, before: String(setting.value), after: String(after) })
    if (after !== setting.default) lines.push(`${label.key}=${after}`)
  }
  if (invalid.length > 0) return { invalid }
  // Never empty: a proposal with no settings still names itself, and returns
  // every value to the appliance's own.
  const content = `# Advanced settings proposed from Status.\n${lines.map(line => `${line}\n`).join("")}`
  return { content, sha256: createHash("sha256").update(content).digest("hex"), changes }
}

// ── off-host copies ──────────────────────────────────────────────────────────
//
// scripts/offhost-copy.sh projects where copies go, the public identities
// Hospital IT checks (the SSH public key and pinned server host keys), and
// bounded results. No secret crosses: not the SSH private key, not the
// encryption key, only a short fingerprint of the latter for escrow checks.

export type OffhostDestination =
  | { type: "mount"; path: string }
  | { type: "sftp"; host: string; port: number; user: string; directory: string }

export type OffhostResult = { at: string; result: string }

export type OffhostSignal = {
  observedAt: string
  destination?: OffhostDestination
  sshPublicKey?: string
  hostKeyFingerprints?: string[]
  encryptionKeyFingerprint?: string
  lastRun?: OffhostResult
  lastTest?: OffhostResult
  lastDrill?: OffhostResult
  drills: DrillEvidence[]
}

const MOUNT_PATH = /^\/[A-Za-z0-9._/-]{1,200}$/
const SFTP_HOST = /^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$/
const SFTP_USER = /^[a-z_][a-z0-9_.-]{0,31}$/
const SFTP_DIRECTORY = /^[A-Za-z0-9._/][A-Za-z0-9._/-]{0,199}$/

function validMountPath(path: string): boolean {
  return MOUNT_PATH.test(path) && !`/${path}/`.includes("/../") && !`/${path}/`.includes("/./")
    && path !== "/" && path !== "/opt/lospor-hospital" && !path.startsWith("/opt/lospor-hospital/")
}

export function validOffhostDestination(destination: OffhostDestination): boolean {
  if (destination.type === "mount") return validMountPath(destination.path)
  return SFTP_HOST.test(destination.host)
    && Number.isInteger(destination.port) && destination.port >= 1 && destination.port <= 65535
    && SFTP_USER.test(destination.user)
    && SFTP_DIRECTORY.test(destination.directory) && !`/${destination.directory}/`.includes("/../")
}

function parseOffhostResult(value: unknown): OffhostResult | null {
  if (!isRecord(value) || !hasExactKeys(value, ["at", "result"])) return null
  if (!validIsoDate(value.at) || typeof value.result !== "string" || !/^OFFHOST_[A-Z0-9_]{2,56}$/.test(value.result)) return null
  return { at: value.at, result: value.result }
}

export function parseOffhostSignal(value: unknown, now = Date.now()): OffhostSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "drills"],
    ["destination", "sshPublicKey", "hostKeyFingerprints", "encryptionKeyFingerprint", "lastRun", "lastTest", "lastDrill"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "offhost"
    || !validIsoDate(value.observedAt) || Date.parse(value.observedAt) > now + MAX_FUTURE_SKEW_MS) return null
  const signal: OffhostSignal = { observedAt: value.observedAt, drills: [] }
  if (value.destination !== undefined) {
    const destination = value.destination
    if (!isRecord(destination)) return null
    if (destination.type === "mount" && hasExactKeys(destination, ["type", "path"]) && typeof destination.path === "string") {
      signal.destination = { type: "mount", path: destination.path }
    } else if (destination.type === "sftp" && hasExactKeys(destination, ["type", "host", "port", "user", "directory"])
      && typeof destination.host === "string" && typeof destination.port === "number"
      && typeof destination.user === "string" && typeof destination.directory === "string") {
      signal.destination = { type: "sftp", host: destination.host, port: destination.port, user: destination.user, directory: destination.directory }
    } else {
      return null
    }
    if (!validOffhostDestination(signal.destination)) return null
  }
  if (value.sshPublicKey !== undefined) {
    if (typeof value.sshPublicKey !== "string" || !/^ssh-ed25519 [A-Za-z0-9+/]{40,120}={0,2}$/.test(value.sshPublicKey)) return null
    signal.sshPublicKey = value.sshPublicKey
  }
  if (value.hostKeyFingerprints !== undefined) {
    if (!Array.isArray(value.hostKeyFingerprints) || value.hostKeyFingerprints.length > 8
      || !value.hostKeyFingerprints.every(item => typeof item === "string" && /^SHA256:[A-Za-z0-9+/]{43}$/.test(item))) return null
    signal.hostKeyFingerprints = value.hostKeyFingerprints as string[]
  }
  if (value.encryptionKeyFingerprint !== undefined) {
    if (typeof value.encryptionKeyFingerprint !== "string" || !/^[a-f0-9]{16}$/.test(value.encryptionKeyFingerprint)) return null
    signal.encryptionKeyFingerprint = value.encryptionKeyFingerprint
  }
  for (const key of ["lastRun", "lastTest", "lastDrill"] as const) {
    if (value[key] === undefined) continue
    const result = parseOffhostResult(value[key])
    if (!result) return null
    signal[key] = result
  }
  if (!Array.isArray(value.drills) || value.drills.length > 10) return null
  for (const drill of value.drills) {
    if (!isRecord(drill) || !hasExactKeys(drill, ["completedAt", "result", "backup"])) return null
    if (!validIsoDate(drill.completedAt) || (drill.result !== "passed" && drill.result !== "failed")) return null
    if (typeof drill.backup !== "string" || !/^lospor-\d{8}T\d{6}Z-[A-Za-z0-9]+\.backup$/.test(drill.backup)) return null
    signal.drills.push({ completedAt: drill.completedAt, result: drill.result, backup: drill.backup })
  }
  return signal
}

export async function readOffhostSignal(stateDir: string, now = Date.now()) {
  return parseOffhostSignal(await readStateJson(join(stateDir, "offhost.v1.json")), now)
}

/** The destination a setup form describes, or null when a field is not valid. */
export function offhostDestinationFromForm(body: Record<string, unknown>): OffhostDestination | null {
  const text = (key: string) => typeof body[key] === "string" ? (body[key] as string).trim() : ""
  let destination: OffhostDestination
  if (body.type === "mount") {
    destination = { type: "mount", path: text("path") }
  } else if (body.type === "sftp") {
    const port = text("port") === "" ? 22 : Number(text("port"))
    destination = { type: "sftp", host: text("host"), port, user: text("user"), directory: text("directory") }
  } else {
    return null
  }
  return validOffhostDestination(destination) ? destination : null
}

/** The fixed-field proposal the host agent accepts for this destination. */
export function buildOffhostProposal(destination: OffhostDestination): { content: string; sha256: string } {
  const content = destination.type === "mount"
    ? `type=mount\npath=${destination.path}\n`
    : `type=sftp\nhost=${destination.host}\nport=${destination.port}\nuser=${destination.user}\ndirectory=${destination.directory}\n`
  return { content, sha256: createHash("sha256").update(content).digest("hex") }
}

// ── support bundle ───────────────────────────────────────────────────────────
//
// losporctl writes it and the host agent copies it beside the projections.
// Status offers it as a download only when it is the privacy-safe support
// document: its type, its creation time, and at most a few kilobytes.

export type SupportBundle = { createdAt: string; release: string; content: string }

export function parseSupportBundle(text: string): SupportBundle | null {
  if (Buffer.byteLength(text) > 65_536) return null
  const value = safeJsonParse(text)
  if (!isRecord(value) || value.schemaVersion !== 1 || value.bundleType !== "lospor-hospital-support") return null
  if (!validIsoDate(value.createdAt) || typeof value.release !== "string" || !/^[A-Za-z0-9._+:-]{1,64}$/.test(value.release)) return null
  return { createdAt: value.createdAt, release: value.release, content: text }
}

export async function readSupportBundle(stateDir: string): Promise<SupportBundle | null> {
  try {
    return parseSupportBundle(await readFile(join(stateDir, "support-bundle.v1.json"), "utf8"))
  } catch {
    return null
  }
}
