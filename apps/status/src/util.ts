import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function hmacSha256(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex")
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function validEmail(value: string): boolean {
  return value.length >= 3
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function validPassword(value: string): boolean {
  return value.length >= 8
    && value.length <= 256
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => allowed.has(key))
}

export function finiteInteger(
  value: unknown,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
}

export function validIsoDate(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 40
    && !Number.isNaN(Date.parse(value))
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export function dayKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10)
}

export function isoDayOffset(daysAgo: number, now = Date.now()): string {
  return dayKey(now - daysAgo * 86_400_000)
}

export function formatBytes(value: string | undefined): string {
  if (!value || !/^\d{1,30}$/.test(value)) return "Unknown"
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return "Unknown"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let amount = bytes
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit += 1
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}
