import "server-only"

import { mkdir, readFile, readdir, rename, stat } from "node:fs/promises"
import { join } from "node:path"

import { CLINICAL_ENUM_RULES } from "@lospor/core/clinical-validation"
import { normalizeEhrImport, type CanonicalEhrImport, type EhrImportRejection } from "@lospor/core/ehr-import"

import { ehrExchangeRoot, INBOX, writeExchangeFile } from "./ehr-transport-folder"
import { resolveFolderLabs } from "./ehr-folder-labs"
import { assumedUnits, recordUnmappedCodes, siteLabCodeMap } from "./ehr-lab-code-map"
import { recordEhrImport, type EhrImportClient } from "./ehr-import"
import type { PatientIdentifierType } from "@/generated/prisma/enums"
import {
  NO_CODE_SYSTEM_ANSWERS,
  recordUnrecognisedCodeSystems,
  siteCodeSystemAnswers,
  unrecognisedCodeSystems,
  type CodeSystemAnswers,
} from "./ehr-code-systems"
import { diagnosisCodeSystemsSeen, resolveImportedDiagnoses, siteLocale } from "./ehr-icd10"
import { resolveImportedProcedures } from "./ehr-procedures"
import { answerFileName, isFolderRequestId } from "./ehr-folder-requests"

/**
 * Read what the hospital system left for us.
 *
 * The mirror of the outbox, and it inherits the mirror of its hazard: a
 * hospital writing a file into a directory we poll can be caught mid-write just
 * as easily as the other way round. We cannot make their write atomic, so this
 * refuses to read a file that was modified a moment ago — a file still being
 * appended to keeps moving, and one that has stopped moving is finished.
 *
 * Nothing here writes to a case. Files become staged EhrImports, which a
 * clinician reviews field by field.
 *
 * Every file read gets an answer the hospital's team can open without us
 * (1.5.0): results/<file>.result.json says whether it was staged, why not if
 * not, which fields were taken and which ignored. The format itself is
 * published in docs/ehr-folder-format.md; this file is its reader.
 */

/** Read, accepted, moved here. Kept briefly so an integration can be debugged. */
export const PROCESSED = "processed"
/** Unreadable or unusable. Kept so somebody can see what arrived. */
export const REJECTED = "rejected"
/** One answer per file read, for the hospital system's team (1.5.0). */
export const RESULTS = "results"

/** The only format version this reader understands. */
export const FOLDER_FORMAT_VERSION = 1

/** A file bigger than this is not a patient's admission data; it is refused unread. */
export const INBOX_MAX_BYTES = 5 * 1024 * 1024

/**
 * How long a file must have been still before it is read.
 *
 * Not a guess about disk speed: it is the window in which a hospital's own
 * writer could still be appending. Too short and a half-written import is
 * staged as though it were complete; too long and a clinician waits for data
 * that has already arrived. Thirty seconds is short enough that the pull flow
 * still feels immediate — the clinician's request stays open for that long
 * anyway.
 */
export const INBOX_SETTLE_MS = 30_000

/** The envelope keys the format defines. Anything else is reported, not read. */
const ENVELOPE_KEYS = new Set(["formatVersion", "identifier", "identifierType", "sourceMessageId", "requestId", "fields"])

export type InboxRejectReason =
  | "unreadable"
  | "too-large"
  | "unsupported-format-version"
  | "no-identifier"
  | "unknown-identifier-type"
  | "nothing-importable"

export type InboundFileResult =
  | { file: string; outcome: "imported"; importId: string; created: boolean }
  | { file: string; outcome: "skipped"; reason: "still-being-written" }
  | { file: string; outcome: "rejected"; reason: InboxRejectReason | "error" }

/**
 * What a file amounted to, as the hospital's team reads it. Carries no
 * patient number: it is written next to the inbox and shown in Status.
 */
export type InboxReport = {
  formatVersion: typeof FOLDER_FORMAT_VERSION
  file: string
  checkedAt: string
  outcome: "imported" | "rejected" | "would-import"
  reason?: InboxRejectReason
  identifierType?: "IZ" | "EGN"
  sourceMessageId?: string
  /** The LOSPOR request this file answers, when it names one (1.5.0). */
  requestId?: string
  fields: {
    /** Fields a clinician will be offered. */
    accepted: string[]
    /** Fields that were present and not used, with why. */
    ignored: { field: string; reason: EhrImportRejection["reason"] | "invalid-value" }[]
  }
  /** Envelope keys this format does not define -- usually a misspelling. */
  unknownKeys: string[]
  labs?: {
    received: number
    /** Results without a sampling time; the clinician sees them as undated. */
    undated: number
    /** Codes this site has not mapped yet; they arrive under the hospital's name. */
    unmappedCodes: { system: string; code: string; display: string }[]
  }
}

type SiteTables = {
  siteMap: Record<string, string>
  units: Record<string, string>
  codeSystems: { answers: CodeSystemAnswers; answered: ReadonlySet<string> }
  locale: "bg" | "en"
}

type Prepared =
  | { ok: false; reason: InboxRejectReason; report: InboxReport }
  | {
    ok: true
    identifier: string
    identifierType: "IZ" | "EGN"
    canonical: CanonicalEhrImport
    report: InboxReport
    unmapped: { system: string; code: string; display: string }[]
    unrecognised: ReturnType<typeof unrecognisedCodeSystems>
  }

function emptyReport(file: string, now: Date): InboxReport {
  return {
    formatVersion: FOLDER_FORMAT_VERSION,
    file,
    checkedAt: now.toISOString(),
    outcome: "rejected",
    fields: { accepted: [], ignored: [] },
    unknownKeys: [],
  }
}

function rejection(report: InboxReport, reason: InboxRejectReason): Prepared {
  return { ok: false, reason, report: { ...report, outcome: "rejected", reason } }
}

/**
 * The identifier type, read strictly. A value we do not recognise is refused
 * rather than read as ИЗ: an EGN filed under the record-number type would be
 * matched against the wrong patients, and the wrong patient's data is the worst
 * outcome available here. Absent means ИЗ, the appliance's default.
 */
function identifierTypeOf(value: unknown): "IZ" | "EGN" | null {
  if (value === undefined || value === null) return "IZ"
  if (typeof value !== "string") return null
  const type = value.trim().toUpperCase()
  return type === "IZ" || type === "EGN" ? type : null
}

const NUMERIC_FIELDS = new Set([
  "ageYears", "ageValue", "heightCm", "weightKg",
  "bpSystolic", "bpDiastolic", "heartRate", "spO2", "temperature", "respiratoryRate",
])
const ENUM_FIELDS = new Set(["ageUnit", "sex", "bloodType", "rhFactor"])
const FLAG_FIELDS = new Set(["allergies", "latexAllergy"])

/**
 * A single value checked against the form's own rules before it is offered.
 *
 * The FHIR reader builds these values itself; a dropped file states them, and
 * a `sex: "M"` or a `bloodType: "A+"` used to reach the clinician's review
 * and fail only when the form refused it. Enumerations are the form's
 * (CLINICAL_ENUM_RULES), matched without regard to case; numbers may arrive as
 * numbers or numeric text, with a decimal comma. Null and absent pass
 * through: saying nothing is not an invalid value.
 */
export function checkedScalar(field: string, value: unknown): { ok: true; value: unknown } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value }
  if (NUMERIC_FIELDS.has(field)) {
    const number = typeof value === "number" ? value : typeof value === "string" && /^\s*-?\d+([.,]\d+)?\s*$/.test(value) ? Number(value.trim().replace(",", ".")) : Number.NaN
    return Number.isFinite(number) ? { ok: true, value: number } : { ok: false }
  }
  if (ENUM_FIELDS.has(field)) {
    const allowed = CLINICAL_ENUM_RULES.preop[field] ?? []
    const match = typeof value === "string" ? allowed.find(entry => entry.toUpperCase() === value.trim().toUpperCase()) : undefined
    return match ? { ok: true, value: match } : { ok: false }
  }
  if (FLAG_FIELDS.has(field)) return typeof value === "boolean" ? { ok: true, value } : { ok: false }
  return { ok: true, value }
}

/**
 * Turn a file's bytes into what would be staged, without touching the
 * database. Shared by the inbox and by Status's "check a file", so a check
 * tells the hospital's team exactly what the inbox will do with that file.
 */
export function prepareInboxDocument(bytes: Buffer | string, input: { file: string; now: Date; tables: SiteTables }): Prepared {
  const report = emptyReport(input.file, input.now)
  // Windows tools often start a UTF-8 file with a byte-order mark, which
  // JSON.parse refuses. It carries no meaning; it is dropped.
  const text = (typeof bytes === "string" ? bytes : bytes.toString("utf8")).replace(/^﻿/, "")
  let document: Record<string, unknown>
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rejection(report, "unreadable")
    document = parsed as Record<string, unknown>
  } catch {
    return rejection(report, "unreadable")
  }

  report.unknownKeys = Object.keys(document).filter(key => !ENVELOPE_KEYS.has(key)).sort()
  if (typeof document.sourceMessageId === "string" && document.sourceMessageId.trim()) {
    report.sourceMessageId = document.sourceMessageId.trim()
  }
  if (isFolderRequestId(document.requestId)) report.requestId = document.requestId
  if (document.formatVersion !== undefined && document.formatVersion !== FOLDER_FORMAT_VERSION) {
    return rejection(report, "unsupported-format-version")
  }

  const identifier = typeof document.identifier === "string" ? document.identifier.trim() : ""
  if (!identifier) {
    // Without it there is no patient to attach this to, and guessing is not
    // available: the wrong patient's labs is the worst outcome here.
    return rejection(report, "no-identifier")
  }
  const identifierType = identifierTypeOf(document.identifierType)
  if (!identifierType) return rejection(report, "unknown-identifier-type")
  report.identifierType = identifierType

  const given = document.fields && typeof document.fields === "object" && !Array.isArray(document.fields)
    ? { ...document.fields as Record<string, unknown> }
    : {}
  // `labResults` is the field's name everywhere else; `labs` is what this reader
  // documented first, so both are read, and a file carrying both gets both.
  if ("labs" in given) {
    const aliased = Array.isArray(given.labs) ? given.labs : []
    const named = Array.isArray(given.labResults) ? given.labResults : []
    given.labResults = [...named, ...aliased]
    delete given.labs
  }

  const invalid: string[] = []
  for (const [field, value] of Object.entries(given)) {
    const checked = checkedScalar(field, value)
    if (checked.ok) given[field] = checked.value
    else { invalid.push(field); delete given[field] }
  }

  // Name the results before they are canonicalised, because the name is what
  // decides the canonical unit: an unrecognised test has no unit to convert
  // into, so a `ХГБ` that a site has mapped must become "Haemoglobin (Hb)"
  // here or it reaches the converter as unconvertible.
  const resolvedLabs = resolveFolderLabs(given.labResults, {
    siteMap: input.tables.siteMap,
    assumedUnits: input.tables.units,
    codeSystems: input.tables.codeSystems.answers,
  })
  const withLabs: Record<string, unknown> = "labResults" in given ? { ...given, labResults: resolvedLabs.labs } : given
  // Diagnoses resolved against LOSPOR's ICD-10, exactly as the FHIR reader does.
  const fields = Object.fromEntries(Object.entries(withLabs).map(([key, value]) =>
    (key === "diagnoses" || key === "comorbidities") && Array.isArray(value)
      ? [key, resolveImportedDiagnoses(value.filter(item => item && typeof item === "object") as Record<string, unknown>[], input.tables.locale, input.tables.codeSystems.answers)]
      // КСМП and ICD-10-PCS procedures, read exactly as the FHIR reader reads them.
      : key === "procedures" && Array.isArray(value)
        ? [key, resolveImportedProcedures(value.filter(item => item && typeof item === "object") as Record<string, unknown>[], input.tables.codeSystems.answers)]
        : [key, value]))
  const diagnosisTags = ["diagnoses", "comorbidities"].flatMap(key => Array.isArray(withLabs[key])
    ? (withLabs[key] as unknown[]).filter(item => item && typeof item === "object") as Record<string, unknown>[]
    : [])
  const unrecognised = unrecognisedCodeSystems([
    ...diagnosisCodeSystemsSeen(diagnosisTags),
    ...resolvedLabs.unmapped.map(item => ({ system: item.system, field: "labs" as const, code: item.code, label: item.display })),
  ], input.tables.codeSystems.answered)

  const normalized = normalizeEhrImport({
    identifierType,
    identifier,
    sourceMessageId: report.sourceMessageId ?? input.file,
    fields,
  })
  report.fields = {
    accepted: normalized.canonical.fields.map(field => field.field),
    ignored: [
      ...normalized.rejected.map(({ field, reason }) => ({ field, reason })),
      ...invalid.map(field => ({ field, reason: "invalid-value" as const })),
    ],
  }
  if ("labResults" in given) {
    report.labs = {
      received: Array.isArray(given.labResults) ? given.labResults.length : 0,
      undated: normalized.undatedLabs,
      unmappedCodes: resolvedLabs.unmapped,
    }
  }
  if (normalized.canonical.fields.length === 0) return rejection(report, "nothing-importable")
  return {
    ok: true,
    identifier,
    identifierType,
    canonical: normalized.canonical,
    report: { ...report, outcome: "imported" },
    unmapped: resolvedLabs.unmapped,
    unrecognised,
  }
}

/**
 * This site's mappings. A lookup that fails must not stop the file being
 * staged: losing them costs precision -- results land under the hospital's own
 * names and the operator is asked about them again -- while refusing the file
 * loses the results entirely, and loses them silently.
 */
async function siteTables(): Promise<SiteTables> {
  const [siteMap, units, codeSystems] = await Promise.all([
    siteLabCodeMap().catch(() => ({})),
    assumedUnits().catch(() => ({})),
    siteCodeSystemAnswers().catch(() => ({ answers: NO_CODE_SYSTEM_ANSWERS, answered: new Set<string>() })),
  ])
  return { siteMap, units, codeSystems, locale: siteLocale() }
}

async function moveTo(root: string, folder: string, name: string): Promise<void> {
  const target = join(root, folder)
  await mkdir(target, { recursive: true })
  await rename(join(root, INBOX, name), join(target, name)).catch(() => undefined)
}

export function resultFileName(file: string): string {
  return `${file.replace(/\.json$/i, "")}.result.json`
}

/**
 * The answer is a courtesy to the hospital's team; failing to write it never
 * changes what happened to the file.
 */
async function writeResult(root: string, report: InboxReport): Promise<void> {
  try {
    await writeExchangeFile(RESULTS, resultFileName(report.file), `${JSON.stringify(report, null, 2)}\n`, root)
    // The answer to a request, findable by its id alone (ehr-folder-requests.ts).
    if (report.requestId) {
      await writeExchangeFile(RESULTS, answerFileName(report.requestId), `${JSON.stringify({
        requestId: report.requestId, outcome: report.outcome, reason: report.reason ?? null, checkedAt: report.checkedAt,
      })}\n`, root)
    }
  } catch {
    console.error("[ehr] EHR_INBOX_RESULT_WRITE_FAILED")
  }
}

/**
 * Stage one file.
 *
 * Every failure moves the file aside rather than leaving it to be retried
 * forever: a malformed message does not become malformed by waiting, and a
 * directory that fills with files nobody can read is how an integration stops
 * being watched at all.
 */
export async function ingestInboxFile(
  client: EhrImportClient,
  input: {
    institutionId: string
    file: string
    root?: string
    now?: Date
    settleMs?: number
  },
): Promise<InboundFileResult> {
  const root = input.root ?? ehrExchangeRoot()
  const now = input.now ?? new Date()
  const path = join(root, INBOX, input.file)

  const info = await stat(path)
  if (now.getTime() - info.mtimeMs < (input.settleMs ?? INBOX_SETTLE_MS)) {
    return { file: input.file, outcome: "skipped", reason: "still-being-written" }
  }

  const reject = async (reason: InboxRejectReason, report: InboxReport): Promise<InboundFileResult> => {
    await moveTo(root, REJECTED, input.file)
    await writeResult(root, { ...report, outcome: "rejected", reason })
    return { file: input.file, outcome: "rejected", reason }
  }
  if (info.size > INBOX_MAX_BYTES) return reject("too-large", emptyReport(input.file, now))

  const prepared = prepareInboxDocument(await readFile(path), { file: input.file, now, tables: await siteTables() })
  if (!prepared.ok) return reject(prepared.reason, prepared.report)

  // A code nobody has mapped is a question for the operator, not a failure
  // here. Recorded on the same screen the FHIR reader fills, and never allowed
  // to stop the file being staged.
  if (prepared.unrecognised.length > 0) {
    await recordUnrecognisedCodeSystems(prepared.unrecognised, now).catch(() => undefined)
  }
  if (prepared.unmapped.length > 0) {
    await recordUnmappedCodes(prepared.unmapped, now).catch(() => undefined)
  }

  const recorded = await recordEhrImport(client, {
    institutionId: input.institutionId,
    identifier: prepared.identifier,
    identifierType: prepared.identifierType as PatientIdentifierType,
    transport: "FOLDER",
    canonical: prepared.canonical,
    now,
  })

  await moveTo(root, PROCESSED, input.file)
  await writeResult(root, prepared.report)
  return {
    file: input.file,
    outcome: "imported",
    importId: recorded.id,
    created: recorded.created,
  }
}

/**
 * Status's "check a file": what the inbox would do with these bytes, with
 * nothing staged, moved or recorded. The patient number never leaves this
 * function.
 */
export async function checkInboxDocument(bytes: Buffer | string, input: { file?: string; now?: Date } = {}): Promise<InboxReport> {
  const now = input.now ?? new Date()
  const file = input.file?.trim() || "checked.json"
  if (Buffer.byteLength(bytes) > INBOX_MAX_BYTES) return { ...emptyReport(file, now), reason: "too-large" }
  const prepared = prepareInboxDocument(bytes, { file, now, tables: await siteTables() })
  return prepared.ok ? { ...prepared.report, outcome: "would-import" } : prepared.report
}

/**
 * Scan the inbox.
 *
 * One bad file never stops the scan. A hospital that drops a hundred files
 * overnight, one of them truncated, must still have the other ninety-nine
 * staged by morning.
 */
export async function scanEhrInbox(
  client: EhrImportClient,
  input: {
    institutionId: string
    root?: string
    now?: Date
    settleMs?: number
    limit?: number
  },
): Promise<InboundFileResult[]> {
  const root = input.root ?? ehrExchangeRoot()
  const inbox = join(root, INBOX)
  await mkdir(inbox, { recursive: true })

  const names = (await readdir(inbox, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map(entry => entry.name)
    .sort()
    .slice(0, input.limit ?? 50)

  const results: InboundFileResult[] = []
  for (const file of names) {
    try {
      results.push(await ingestInboxFile(client, { ...input, file, root }))
    } catch {
      console.error("[ehr] EHR_INBOX_FILE_FAILED")
      results.push({ file, outcome: "rejected", reason: "error" })
    }
  }
  return results
}

export type InboxHealth = {
  /** Files waiting in the inbox now. */
  waiting: number
  /** Age of the oldest waiting file; a growing number means the reader is not running. */
  oldestWaitingSeconds: number | null
  /** When the last file was read, staged or not. */
  lastReadAt: string | null
  last24h: { imported: number; rejected: number }
  /** The latest refusals, newest first: what the hospital's team should look at. */
  recentRejections: { file: string; reason: InboxRejectReason; at: string }[]
}

/** How the folder exchange is doing, read from the folders themselves. */
export async function ehrInboxHealth(input: { root?: string; now?: Date } = {}): Promise<InboxHealth> {
  const root = input.root ?? ehrExchangeRoot()
  const now = input.now ?? new Date()
  const listing = async (folder: string) => readdir(join(root, folder), { withFileTypes: true })
    .then(entries => entries.filter(entry => entry.isFile()).map(entry => entry.name))
    .catch(() => [] as string[])

  const waitingNames = (await listing(INBOX)).filter(name => name.toLowerCase().endsWith(".json"))
  const waitingTimes = await Promise.all(waitingNames.map(name => stat(join(root, INBOX, name)).then(info => info.mtimeMs).catch(() => null)))
  const oldest = waitingTimes.filter((time): time is number => time !== null).sort((a, b) => a - b)[0]

  // Newest results first; a site's whole retention window is a few thousand at most.
  const resultNames = (await listing(RESULTS)).filter(name => name.endsWith(".result.json"))
  const reports = (await Promise.all(resultNames.map(async name => {
    try {
      return JSON.parse(await readFile(join(root, RESULTS, name), "utf8")) as InboxReport
    } catch {
      return null
    }
  }))).filter((report): report is InboxReport => !!report && typeof report.checkedAt === "string")
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))

  const since = now.getTime() - 24 * 3_600_000
  const recent = reports.filter(report => Date.parse(report.checkedAt) >= since)
  return {
    waiting: waitingNames.length,
    oldestWaitingSeconds: oldest === undefined ? null : Math.max(0, Math.round((now.getTime() - oldest) / 1000)),
    lastReadAt: reports[0]?.checkedAt ?? null,
    last24h: {
      imported: recent.filter(report => report.outcome === "imported").length,
      rejected: recent.filter(report => report.outcome === "rejected").length,
    },
    recentRejections: reports
      .filter(report => report.outcome === "rejected" && report.reason)
      .slice(0, 5)
      .map(report => ({ file: report.file, reason: report.reason as InboxRejectReason, at: report.checkedAt })),
  }
}
