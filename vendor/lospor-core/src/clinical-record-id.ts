/**
 * Creates a client-side id for a structured clinical record.
 *
 * The timestamp makes the id useful when inspecting a chart, while the
 * sequence and entropy keep two clients recording at the same clinical time
 * from colliding. The UUID is an additional entropy source, never the only
 * part of the id, and the fallback keeps native/offline runtimes working.
 */
let sequence = 0

type CryptoLike = { randomUUID?: () => string; getRandomValues?: (array: Uint8Array) => Uint8Array }

function entropy(): string {
  const crypto = (globalThis as typeof globalThis & { crypto?: CryptoLike }).crypto
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID()
  // randomUUID needs a secure context; plain-HTTP pages still have getRandomValues.
  if (typeof crypto?.getRandomValues === "function") {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")
  }
  return Math.random().toString(36).slice(2, 12)
}

export function clinicalRecordId(prefix: string, at: string | number = Date.now()): string {
  const parsed = typeof at === "number" ? at : Date.parse(at)
  const timestamp = Number.isFinite(parsed) ? parsed : Date.now()
  sequence = (sequence + 1) % 1_000_000
  return `${prefix}-${timestamp.toString(36)}-${sequence.toString(36)}-${entropy()}`
}
