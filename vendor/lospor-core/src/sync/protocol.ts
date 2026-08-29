// Shared save/sync protocol contract for LOSPOR clients (web + mobile).
//
// This module is the single source of truth for the wire-level vocabulary the
// clients use to talk to the case API: section names, conflict headers,
// response shapes, idempotency keys, and the one sync status vocabulary every
// screen renders. Client apps must not hardcode any of these strings locally.

export type CaseSection = "preop" | "postop" | "intraop"

export const CASE_SECTIONS: readonly CaseSection[] = ["preop", "postop", "intraop"]

/** Per-section optimistic-concurrency header: "I last saw this section at <ts>". */
export const SECTION_CONFLICT_HEADER: Record<CaseSection, string> = {
  preop: "x-lospor-preop-updated-at",
  postop: "x-lospor-postop-updated-at",
  intraop: "x-lospor-intraop-updated-at",
}

/** Monotonic section revision used by v5.6+ clients. Timestamp headers remain
 * accepted during the compatibility window for older installed builds. */
export const SECTION_REVISION_HEADER: Record<CaseSection, string> = {
  preop: "x-lospor-preop-revision",
  postop: "x-lospor-postop-revision",
  intraop: "x-lospor-intraop-revision",
}

/**
 * The caller acknowledges this save will discard a newer version, and asks
 * for it anyway -- a queued offline save, or an explicit "overwrite" in a
 * conflict-resolution UI.
 *
 * Renamed from FORCE_UPDATE_HEADER / x-lospor-force-update. The old name read
 * like a retry hint, and the server treated it as one: it skipped the conflict
 * response and left no record that a colleague's edits had been replaced. The
 * API now records every override that actually discards something, and no
 * longer answers to the old header.
 */
export const OVERRIDE_CONFLICT_HEADER = "x-lospor-override-conflict"

/** Dedup header for event appends — replaying the same key stores the event once. */
export const IDEMPOTENCY_HEADER = "X-Idempotency-Key"

/** Which client produced a write (audit trail). */
export const SOURCE_HEADER = "X-Lospor-Source"

/** Stable identity of an autosave operation across retries. */
export const OPERATION_ID_HEADER = "X-Lospor-Operation-Id"

/** Identifies the first-party client and its release for compatibility diagnostics. */
export const CLIENT_NAME_HEADER = "X-Lospor-Client"
export const CLIENT_VERSION_HEADER = "X-Lospor-Client-Version"
export const API_VERSION_HEADER = "X-Lospor-API-Version"

/** Headers accepted by every LOSPOR API CORS preflight. */
export const CORS_REQUEST_HEADERS = [
  "Content-Type",
  "Authorization",
  ...Object.values(SECTION_CONFLICT_HEADER),
  ...Object.values(SECTION_REVISION_HEADER),
  "x-lospor-updated-at",
  OVERRIDE_CONFLICT_HEADER,
  SOURCE_HEADER,
  IDEMPOTENCY_HEADER,
  OPERATION_ID_HEADER,
  CLIENT_NAME_HEADER,
  CLIENT_VERSION_HEADER,
] as const

export const CORS_REQUEST_HEADERS_VALUE = CORS_REQUEST_HEADERS.join(", ")

export type WriteSource = "web" | "mobile" | "ai" | "import"

/** Stable idempotency key for a single intraop event append. */
export function eventIdempotencyKey(caseId: string, eventId: string): string {
  return `${caseId}:${eventId}`
}

/** Successful PATCH/PUT responses echo the fresh per-section timestamps. */
/** A field the server refused to store, and why. */
export type RejectedField = {
  /** Dotted path within the patch body, e.g. "preop.heightCm". */
  path: string
  message: string
}

export type CasePatchResponse = {
  updatedAt?: string
  preopUpdatedAt?: string
  postopUpdatedAt?: string
  intraopUpdatedAt?: string
  preopRevision?: number
  postopRevision?: number
  intraopRevision?: number
  /**
   * Set when the save succeeded but individual values were rejected (out of
   * range, wrong type). The rest of the section WAS stored. Clients must tell
   * the user — a value they can still see on screen was not saved.
   */
  rejectedFields?: RejectedField[]
}

export type ServerVersion = { updatedAt?: string } & Record<string, unknown>

/** Body shape of a 409 conflict response. */
export type ConflictBody = {
  error?: string
  section?: string
  reason?: string
  serverVersion?: ServerVersion
}

export type BlockedSaveReason =
  | "egn"
  | "long_number"
  | "date"
  | "email"
  | "likely_name"
  | string

/**
 * A server-rejected field that cannot succeed until the clinician edits it.
 * `blockedKeys` are section-relative wire keys representing the same UI field.
 */
export type BlockedSaveIssue = {
  code: "PII_BLOCKED" | string
  field: string
  reason: BlockedSaveReason
  message: string
  retryable: false
  blockedKeys: readonly string[]
}

/**
 * Server rejections a retry cannot fix, because the answer itself is wrong.
 *
 * These are domain decisions, not transport failures: an adult mode asserted
 * over a patient the record says is twelve is refused every time it is sent.
 * Replaying them forever is what made a corrected case sit in "saved locally,
 * waiting for connection" while the server was reachable and answering.
 *
 * PII_BLOCKED names its own field on the wire. These carry only a code, so the
 * cluster of fields the clinician must revisit is derived from it. Grouping
 * mode with the age fields matters: the outbox quarantines exactly these keys
 * and retries the rest, so a save that also changed the weight still saves the
 * weight.
 *
 * Deliberately excluded: PEDIATRIC_MODE_DISABLED and
 * PEDIATRIC_CLIENT_UPDATE_REQUIRED. Those describe an appliance that has not
 * enabled the feature or a client that is behind, and both stop being true
 * without the clinician editing anything -- they are genuinely retryable.
 */
const DOMAIN_BLOCKED_FIELDS: Record<string, { field: string; keys: readonly string[] }> = {
  PEDIATRIC_MODE_REQUIRED: { field: "clinicalMode", keys: ["clinicalMode", "ageValue", "ageUnit", "ageYears"] },
  ADULT_MODE_REQUIRED: { field: "clinicalMode", keys: ["clinicalMode", "ageValue", "ageUnit", "ageYears"] },
  PEDIATRIC_AGE_REQUIRED: { field: "ageValue", keys: ["ageValue", "ageUnit"] },
  INVALID_PEDIATRIC_AGE: { field: "ageValue", keys: ["ageValue", "ageUnit"] },
}

/** Safely read a structured save error without trusting the wire payload. */
export function readBlockedSaveIssue(value: unknown): BlockedSaveIssue | null {
  if (!value || typeof value !== "object") return null
  const body = value as Record<string, unknown>
  if (typeof body.code === "string") {
    const domain = DOMAIN_BLOCKED_FIELDS[body.code]
    if (domain) {
      const message = typeof body.error === "string" && body.error
        ? body.error
        : typeof body.message === "string" && body.message
          ? body.message
          : body.code
      return {
        code: body.code,
        field: domain.field,
        // The code is the reason. Callers switch on it to choose their copy;
        // falling through to the PII wording would tell a clinician their age
        // entry contains identifying information.
        reason: body.code,
        message,
        retryable: false,
        blockedKeys: domain.keys,
      }
    }
  }
  if (body.code !== "PII_BLOCKED") return null
  if (typeof body.field !== "string" || !body.field) return null
  if (typeof body.reason !== "string" || !body.reason) return null
  const message = typeof body.error === "string"
    ? body.error
    : typeof body.message === "string"
      ? body.message
      : "This field contains identifying information and was not saved."
  const blockedKeys = Array.isArray(body.blockedKeys)
    ? body.blockedKeys.filter((key): key is string => typeof key === "string" && Boolean(key))
    : []
  return {
    code: "PII_BLOCKED",
    field: body.field,
    reason: body.reason,
    message,
    retryable: false,
    blockedKeys: blockedKeys.length > 0 ? blockedKeys : [body.field.split(".").pop() ?? body.field],
  }
}

export function captureBlockedSaveValues(
  issue: BlockedSaveIssue,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const key of issue.blockedKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) values[key] = payload[key]
  }
  return values
}

export function blockedSaveValueChanged(
  issue: BlockedSaveIssue,
  previousValues: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
): boolean {
  return issue.blockedKeys.some(
    (key) =>
      Object.prototype.hasOwnProperty.call(nextPayload, key)
      && serializedSyncValue(nextPayload[key]) !== serializedSyncValue(previousValues[key]),
  )
}

function serializedSyncValue(value: unknown): string {
  return JSON.stringify(canonicalSyncValue(value))
}

function canonicalSyncValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSyncValue)
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = canonicalSyncValue((value as Record<string, unknown>)[key])
    }
    return output
  }
  return value
}

/**
 * The one sync-status vocabulary. Every save surface on web and mobile maps to
 * this union — no screen defines its own status enum.
 *
 * idle     nothing to do
 * saving   a write is in flight
 * saved    last write acknowledged by the server
 * queued   write stored locally, waiting for connectivity (offline tray)
 * conflict server rejected a stale write and self-heal did not resolve it
 * failed   write failed for another reason; will be retried
 * offline  device knows it has no connectivity
 */
export type SyncStatus =
  | "idle"
  | "saving"
  | "saved"
  | "queued"
  | "blocked"
  | "conflict"
  | "failed"
  | "offline"

/** Mutable holder for the client's base timestamp of a section (React ref-compatible). */
export type TimestampRef = { current: string | null }

/** A revision token can be the v5.6 monotonic integer or a legacy timestamp. */
export type SectionRevision = number | string | null
export type RevisionRef = { current: SectionRevision }

/** Build the canonical optimistic-concurrency headers for a section save. */
export function buildSectionRevisionHeaders(
  section: CaseSection,
  revision: SectionRevision | undefined,
): Record<string, string> {
  if (typeof revision === "number") {
    return { [SECTION_REVISION_HEADER[section]]: String(revision) }
  }
  if (typeof revision === "string" && revision) {
    return { [SECTION_CONFLICT_HEADER[section]]: revision }
  }
  return {}
}

/** Read a section revision from response headers, preferring the numeric token. */
export function readSectionRevisionHeaders(
  section: CaseSection,
  headers: { get(name: string): string | null },
): SectionRevision {
  const revision = headers.get(SECTION_REVISION_HEADER[section])
  if (revision !== null && revision.trim() !== "") {
    const parsed = Number(revision)
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed
  }
  const timestamp = headers.get(SECTION_CONFLICT_HEADER[section])
  return timestamp && timestamp.trim() ? timestamp : null
}

export function responseRevision(
  section: CaseSection,
  body: CasePatchResponse,
): SectionRevision {
  const numeric =
    section === "preop" ? body.preopRevision :
    section === "postop" ? body.postopRevision :
    body.intraopRevision
  if (typeof numeric === "number") return numeric
  const legacy =
    section === "preop" ? body.preopUpdatedAt :
    section === "postop" ? body.postopUpdatedAt :
    body.intraopUpdatedAt
  return typeof legacy === "string" ? legacy : null
}

/**
 * Minimal async key-value storage the sync engine persists queues into.
 * Mobile: expo-secure-store. Web: IndexedDB adapter. Tests: in-memory map.
 */
export type KVAdapter = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  /**
   * Optional key enumeration (prefix match). Where available (IndexedDB),
   * crash/multi-tab reconciliation can rebuild queue indexes from actual
   * storage contents instead of guessing from the possibly-corrupt index.
   * SecureStore cannot enumerate — engines must degrade gracefully without it.
   */
  keys?(prefix: string): Promise<string[]>
}

/** Safely extract serverVersion.updatedAt from an unknown 409 body. */
export function serverVersionUpdatedAt(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const serverVersion = (body as { serverVersion?: unknown }).serverVersion
  if (!serverVersion || typeof serverVersion !== "object") return null
  const updatedAt = (serverVersion as { updatedAt?: unknown }).updatedAt
  return typeof updatedAt === "string" ? updatedAt : null
}

export function serverVersionRevision(body: unknown): SectionRevision {
  if (!body || typeof body !== "object") return null
  const serverVersion = (body as { serverVersion?: unknown }).serverVersion
  if (!serverVersion || typeof serverVersion !== "object") return null
  const revision = (serverVersion as { revision?: unknown }).revision
  if (typeof revision === "number" && Number.isSafeInteger(revision)) return revision
  return serverVersionUpdatedAt(body)
}

export function parseConflictBody(value: unknown): ConflictBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const serverVersion =
    body.serverVersion && typeof body.serverVersion === "object" && !Array.isArray(body.serverVersion)
      ? body.serverVersion as ServerVersion
      : undefined
  return {
    error: typeof body.error === "string" ? body.error : undefined,
    section: typeof body.section === "string" ? body.section : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
    serverVersion,
  }
}
