import "server-only"

import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "./deployment"

type Database = PrismaClient | Prisma.TransactionClient

/** The keys whose identity a database is bound to, and why each one matters. */
const WATCHED_KEYS = [
  {
    field: "patientHmacKeyFingerprint",
    env: "HOSPITAL_PATIENT_HMAC_KEY",
    /** Finds a patient. Change it and no stored identifier is ever found again. */
    describes: "patient lookup",
  },
  {
    field: "patientEncryptionKeyFingerprint",
    env: "HOSPITAL_PATIENT_ENCRYPTION_KEY",
    /** Recovers an identifier. Change it and none of them decrypt. */
    describes: "patient identifier decryption",
  },
  {
    field: "exportPseudonymKeyFingerprint",
    env: "HOSPITAL_EXPORT_PSEUDONYM_KEY",
    /** Names a person to Central. Change it and every prior export is orphaned. */
    describes: "export pseudonymisation",
  },
] as const

export type KeyIdentityState =
  | { status: "ok" }
  /** Nothing recorded yet: a fresh install, or the first start after this shipped. */
  | { status: "recorded" }
  /** An operator accepted the mismatch and continued under different keys. */
  | { status: "overridden"; reason: string | null }
  | { status: "mismatch"; mismatched: string[] }
  /** A key is absent, which is a configuration failure rather than a mismatch. */
  | { status: "unconfigured"; missing: string[] }

/**
 * Same construction the backup manifest uses, so an operator comparing the two
 * by eye is comparing like with like.
 */
export function keyFingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

function currentFingerprints(): { fingerprints: Record<string, string>; missing: string[] } {
  const fingerprints: Record<string, string> = {}
  const missing: string[] = []
  for (const key of WATCHED_KEYS) {
    const value = process.env[key.env]
    if (!value) missing.push(key.env)
    else fingerprints[key.field] = keyFingerprint(value)
  }
  return { fingerprints, missing }
}

/**
 * Whether this database is running under the keys it was built with.
 *
 * Trust on first use. Nothing recorded means there is nothing to disagree with,
 * so the loaded keys are written down as correct — which is why a fresh install
 * can never be blocked by this check, and why the first start of an appliance
 * that has been running for a year is equally safe: keys that have been in use
 * are by definition the right ones.
 *
 * A mismatch means the database and the secrets came from different places. The
 * usual cause is a restore that brought the database but not `.env`, and the
 * reason it is worth refusing over is that it does not otherwise announce
 * itself: the appliance serves normally while every identifier it writes is
 * unrelatable to every identifier already stored, and every pseudonym it sends
 * to Central describes a person nobody has seen before.
 */
export async function checkKeyIdentity(db: Database = prisma): Promise<KeyIdentityState> {
  if (!isHospitalDeployment()) return { status: "ok" }

  const { fingerprints, missing } = currentFingerprints()
  if (missing.length > 0) return { status: "unconfigured", missing }

  const recorded = await db.hospitalKeyIdentity.findUnique({ where: { id: "local" } })
  if (!recorded) {
    await db.hospitalKeyIdentity.create({
      data: { id: "local", ...fingerprints } as never,
    })
    return { status: "recorded" }
  }

  const mismatched = WATCHED_KEYS
    .filter(key => (recorded as unknown as Record<string, string>)[key.field] !== fingerprints[key.field])
    .map(key => key.describes)

  if (mismatched.length === 0) return { status: "ok" }
  // An override is a decision already taken and recorded, so it does not keep
  // asking. Re-recording the new fingerprints would erase the evidence that the
  // appliance ever changed identity, which is the one thing worth keeping.
  if (recorded.overriddenAt) return { status: "overridden", reason: recorded.overrideReason }
  return { status: "mismatch", mismatched }
}

/** Wording an operator reading a health endpoint at 2am can act on. */
export function keyIdentityMessage(state: KeyIdentityState): string | null {
  switch (state.status) {
    case "unconfigured":
      return `Patient key configuration is incomplete: ${state.missing.join(", ")}.`
    case "mismatch":
      return `This database was built under different keys (${state.mismatched.join(", ")}). `
        + "Restore the installation's original .env and secrets/ from escrow. "
        + "Continuing under the current keys would leave every stored patient "
        + "identifier unreadable and every case already sent to Central "
        + "unmatchable, and requires a recorded override."
    default:
      return null
  }
}
