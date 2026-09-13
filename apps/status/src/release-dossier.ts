import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { hasExactKeys, isRecord, safeJsonParse, validIsoDate } from "./util.js"

// A release's dossier, as scripts/release-dossier.py projects it after checking
// it against the signed release lock: counts, fixed words, dates and public
// identifiers. The installer writes one for the release it installs, and the
// update agent one for each release it downloads.

export type ReleaseDossier = {
  verifiedAt: string
  version: string
  commit: string
  createdAt: string | null
  build: { runId: string; runAttempt: number; runUrl: string }
  images: number
  sbomComponents: number
  vulnerabilities: {
    critical: number
    high: number
    exceptions: { image: string; vulnerabilityId: string; expiresAt: string }[]
  }
  compatibility: {
    rollbackPolicy: "backup-required" | "service-compatible"
    rollbackWindowDays: number
    schemaMaximum: string
  }
  upstream: Record<string, string>
}

const whole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function parseReleaseDossier(value: unknown, expectedVersion: string): ReleaseDossier | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "signalType", "verifiedAt", "version", "commit", "createdAt", "build", "images",
    "sbomComponents", "vulnerabilities", "compatibility", "upstream",
  ])) return null
  if (value.schemaVersion !== 1 || value.signalType !== "release-dossier" || !validIsoDate(value.verifiedAt)) return null
  if (value.version !== expectedVersion || typeof value.version !== "string" || !VERSION.test(value.version)) return null
  if (typeof value.commit !== "string" || !/^[a-f0-9]{40}$/.test(value.commit)) return null
  if (!(value.createdAt === null || validIsoDate(value.createdAt))) return null
  const build = value.build
  if (!isRecord(build) || !hasExactKeys(build, ["runId", "runAttempt", "runUrl"])
    || typeof build.runId !== "string" || !/^[1-9]\d{0,19}$/.test(build.runId) || !whole(build.runAttempt) || build.runAttempt < 1
    || typeof build.runUrl !== "string"
    || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+\/attempts\/\d+$/.test(build.runUrl)) return null
  if (!whole(value.images) || !whole(value.sbomComponents)) return null
  const vulnerabilities = value.vulnerabilities
  if (!isRecord(vulnerabilities) || !hasExactKeys(vulnerabilities, ["critical", "high", "exceptions"])
    || !whole(vulnerabilities.critical) || !whole(vulnerabilities.high)
    || !Array.isArray(vulnerabilities.exceptions) || vulnerabilities.exceptions.length > 50) return null
  const exceptions: ReleaseDossier["vulnerabilities"]["exceptions"] = []
  for (const exception of vulnerabilities.exceptions) {
    if (!isRecord(exception) || !hasExactKeys(exception, ["image", "vulnerabilityId", "expiresAt"])
      || typeof exception.image !== "string" || !/^[a-z][a-z-]{1,20}$/.test(exception.image)
      || typeof exception.vulnerabilityId !== "string" || !/^[A-Z][A-Z0-9-]{2,63}$/.test(exception.vulnerabilityId)
      || typeof exception.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expiresAt)) return null
    exceptions.push({ image: exception.image, vulnerabilityId: exception.vulnerabilityId, expiresAt: exception.expiresAt })
  }
  const compatibility = value.compatibility
  if (!isRecord(compatibility) || !hasExactKeys(compatibility, ["rollbackPolicy", "rollbackWindowDays", "schemaMaximum"])
    || (compatibility.rollbackPolicy !== "backup-required" && compatibility.rollbackPolicy !== "service-compatible")
    || !whole(compatibility.rollbackWindowDays)
    || typeof compatibility.schemaMaximum !== "string" || !/^\d{14}_[a-z0-9_]{1,80}$/.test(compatibility.schemaMaximum)) return null
  if (!isRecord(value.upstream)) return null
  const upstream: Record<string, string> = {}
  for (const [name, version] of Object.entries(value.upstream)) {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(name) || typeof version !== "string" || !/^[0-9A-Za-z.+-]{1,40}$/.test(version)) return null
    upstream[name] = version
  }
  return {
    verifiedAt: value.verifiedAt,
    version: value.version,
    commit: value.commit,
    createdAt: value.createdAt,
    build: { runId: build.runId, runAttempt: build.runAttempt, runUrl: build.runUrl },
    images: value.images,
    sbomComponents: value.sbomComponents,
    vulnerabilities: { critical: vulnerabilities.critical, high: vulnerabilities.high, exceptions },
    compatibility: {
      rollbackPolicy: compatibility.rollbackPolicy,
      rollbackWindowDays: compatibility.rollbackWindowDays,
      schemaMaximum: compatibility.schemaMaximum,
    },
    upstream,
  }
}

export async function readReleaseDossier(stateDir: string, version: string | undefined): Promise<ReleaseDossier | null> {
  if (!version || !VERSION.test(version)) return null
  try {
    const text = await readFile(join(stateDir, `release-dossier-${version}.v1.json`), "utf8")
    return Buffer.byteLength(text) > 16_384 ? null : parseReleaseDossier(safeJsonParse(text), version)
  } catch {
    return null
  }
}
