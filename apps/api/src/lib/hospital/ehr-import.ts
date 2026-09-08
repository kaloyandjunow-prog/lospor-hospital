import "server-only"

import { createHash } from "node:crypto"

import type { CanonicalEhrImport } from "@lospor/core/ehr-import"
import {
  buildEhrReviewPlan,
  type EhrReviewPlan,
  ehrItemKey,
} from "@lospor/core/ehr-import-review"
import type { ClinicalMode } from "@lospor/core/pediatric"

import {
  identifierYearFor,
  maskPatientIdentifier,
  normalizePatientIdentifier,
  patientIdentifierHash,
} from "./patient-identity"
import type { Prisma } from "@/generated/prisma/client"
import type { PatientIdentifierType } from "@/generated/prisma/enums"

/**
 * The appliance half of receiving an import: stage what arrived, show it, and
 * remember what was decided.
 *
 * Nothing here writes a clinical value into a case. The values live in
 * EhrImport/EhrImportField until a clinician accepts them, and the accepted
 * ones are then written by that clinician through the ordinary case PATCH —
 * same route, same validation, same audit, same conflict handling. This module
 * only records the decision afterwards.
 *
 * **The order matters and is the safe one.** The client applies the patch
 * first, then records decisions. If it fails in between, the import stays
 * PENDING and the clinician is shown the same proposals again — but the values
 * are now in the case, so the rebuilt plan marks them `unchanged` and they drop
 * off the screen on their own. The reverse order would record a decision for a
 * value that never landed, which is silent clinical data loss.
 */

/**
 * A group of clinical information the hospital system holds, named the way a
 * clinician names it rather than the way a transport does.
 *
 * FHIR calls one of these AllergyIntolerance and another MedicationStatement;
 * a folder drop calls them something else again. What reaches the review
 * screen has to be neither.
 */
export type EhrSourceGroup = "labs" | "diagnoses" | "allergies" | "medications" | "procedures"

/** A group that could not be read, and the transport's reason. */
export type EhrUnreadSource = { group: EhrSourceGroup; errorCode: string }

/** How long an unclaimed import is kept before it expires. */
export const EHR_IMPORT_RETENTION_DAYS = 14

/**
 * Takes the client or a transaction, the same way resolvePatientLink does, so
 * staging an import can join a larger transaction when a transport needs it.
 */
export type EhrImportClient =
  Pick<Prisma.TransactionClient, "ehrImport" | "ehrImportField">

export class EhrImportError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = "EhrImportError"
  }
}

/**
 * A message is identified by what it says, not by what the sender calls it.
 *
 * Hospital systems redeliver: a folder is rescanned, an HL7 sender retries
 * without an acknowledgement, a nightly drop repeats yesterday's file. Keying
 * on the payload means the same content cannot become a second pending import
 * for the clinician to read and decide twice.
 */
export function ehrPayloadHash(canonical: CanonicalEhrImport): string {
  return createHash("sha256")
    .update(JSON.stringify({
      identifier: canonical.identifier,
      fields: canonical.fields,
    }))
    .digest("hex")
}

/**
 * The same digest a PatientLink would get, so an import can be found by the
 * number a clinician types without the number being stored here.
 *
 * ИЗ № is year-scoped and ЕГН is not, which `identifierYearFor` decides. The
 * year has to come from when the identifier was *issued*, and nothing here
 * knows that: a record number carries no year, and the appliance never sees
 * the admission it belongs to. So the write stamps the year it arrived in and
 * the read searches the years it could plausibly have arrived in --
 * `importIdentityCandidates` below.
 */
function importIdentity(
  institutionId: string,
  identifierType: PatientIdentifierType,
  identifier: string,
  at: Date,
) {
  const identifierYear = identifierYearFor(identifierType, at)
  return {
    identifierType,
    identifierYear,
    identifierHash: patientIdentifierHash(
      institutionId,
      normalizePatientIdentifier(identifier),
      { identifierType, identifierYear, hashVersion: 2 },
    ),
  }
}

/**
 * Every identity scope a number typed *now* could have been staged under.
 *
 * ИЗ № restarts at 1 every January, so the year is part of what makes the
 * number mean something -- and the year the appliance can observe is the one
 * it happened to be when the message arrived, not the one the hospital issued
 * the number in. Those are the same number on 364 days and different on the
 * 365th.
 *
 * An import staged on 31 December was hashed under that year. The clinician
 * who opens the case on 1 January types the same digits and hashes under the
 * next one, and the import is invisible -- for the whole of the retention
 * window, not just that morning. So the read tries this year and then last,
 * newest first, which is also the order that keeps a same-numbered admission
 * from this year winning over a stale one from last.
 *
 * Two years, not more: nothing outlives EHR_IMPORT_RETENTION_DAYS, so a third
 * scope could only ever match rows that no longer exist.
 *
 * ЕГН is issued once for life and hashes under the unscoped year, so its list
 * is one entry and the fallback costs it nothing.
 */
export function importIdentityCandidates(
  institutionId: string,
  identifierType: PatientIdentifierType,
  identifier: string,
  at: Date,
) {
  const here = importIdentity(institutionId, identifierType, identifier, at)
  if (identifierType !== "IZ") return [here]

  const lastYear = new Date(at)
  lastYear.setFullYear(at.getFullYear() - 1)
  return [here, importIdentity(institutionId, identifierType, identifier, lastYear)]
}

/**
 * Stage what a transport delivered.
 *
 * Returns the existing row when the same payload has already been recorded,
 * rather than raising: a redelivery is a normal event and not an error worth
 * failing a transport over.
 */
export async function recordEhrImport(
  client: EhrImportClient,
  input: {
    institutionId: string
    identifier: string
    identifierType: PatientIdentifierType
    transport: "FOLDER" | "FHIR" | "HL7V2"
    canonical: CanonicalEhrImport
    /**
     * True when the patient was matched on the record number alone, because
     * nobody had said which of the hospital's numberings it belongs to.
     * Carried onto the row so the clinician reviewing it later can see how much
     * the match is worth -- by then the search that produced it is gone.
     */
    identityUnverified?: boolean
    /**
     * Groups the transport could not read.
     *
     * An import is offered even when some of it failed, because the half that
     * arrived is worth having. This is what stops the missing half from
     * reading as an absence -- an allergy list that failed to load looks
     * exactly like a patient with no allergies, and only one of those is
     * reassuring.
     */
    unread?: EhrUnreadSource[]
    now?: Date
    retentionDays?: number
  },
): Promise<{ id: string; created: boolean }> {
  const now = input.now ?? new Date()
  const payloadHash = ehrPayloadHash(input.canonical)

  const existing = await client.ehrImport.findFirst({
    where: { institutionId: input.institutionId, payloadHash },
    select: { id: true },
  })
  if (existing) return { id: String(existing.id), created: false }

  const identity = importIdentity(
    input.institutionId, input.identifierType, input.identifier, now,
  )

  const expiresAt = new Date(now.getTime()
    + (input.retentionDays ?? EHR_IMPORT_RETENTION_DAYS) * 86_400_000)

  const created = await client.ehrImport.create({
    data: {
      institutionId: input.institutionId,
      ...identity,
      hashVersion: 2,
      maskedIdentifier: maskPatientIdentifier(input.identifier),
      transport: input.transport,
      sourceMessageId: input.canonical.sourceMessageId ?? null,
      payloadHash,
      receivedAt: now,
      expiresAt,
      identityUnverified: input.identityUnverified ?? false,
      // Omitted rather than an empty array when everything was read: the column
      // defaults to NULL, absence of a warning is the common case, and it should
      // not need a row of JSON to say so.
      ...(input.unread?.length ? { unreadSources: input.unread as never } : {}),
      // One row per reviewable item. A tag list of three becomes three rows,
      // because that is the grain a clinician decides at — and a refusal is
      // remembered against the item, not the field it arrived in.
      fields: {
        create: input.canonical.fields.flatMap(field => {
          // Everything importable is preop; the section is carried explicitly
          // so a later inbound group does not need a schema change.
          const common = { section: "preop", fieldKey: field.field }
          if (field.shape === "scalar") {
            return [{
              ...common,
              itemKey: ehrItemKey(field.field),
              proposedValue: field.value as never,
            }]
          }
          return (field.value as unknown[]).map(item => ({
            ...common,
            itemKey: ehrItemKey(field.field, item),
            proposedValue: item as never,
          }))
        }),
      },
    },
    select: { id: true },
  })
  return { id: String(created.id), created: true }
}

/**
 * The import a clinician should be shown for this patient, if any.
 *
 * Expired rows are excluded here rather than deleted on a schedule — there is
 * no scheduler in the appliance, so "expired" is a predicate, not a job.
 */
export async function findPendingEhrImport(
  client: EhrImportClient,
  input: {
    institutionId: string
    identifier: string
    identifierType: PatientIdentifierType
    now?: Date
  },
): Promise<{
  id: string
  maskedIdentifier: string
  receivedAt: Date
  identityUnverified: boolean
  unread: EhrUnreadSource[]
} | null> {
  const now = input.now ?? new Date()
  const candidates = importIdentityCandidates(
    input.institutionId, input.identifierType, input.identifier, now,
  )

  // In order, and the first hit wins. This year before last, so a fresh
  // admission carrying a number reused from last year is the one found.
  let row = null
  for (const identity of candidates) {
    row = await client.ehrImport.findFirst({
      where: {
        institutionId: input.institutionId,
        identifierType: identity.identifierType,
        identifierHash: identity.identifierHash,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        maskedIdentifier: true,
        receivedAt: true,
        identityUnverified: true,
        unreadSources: true,
      },
    })
    if (row) break
  }
  if (!row) return null
  return {
    id: String(row.id),
    maskedIdentifier: String(row.maskedIdentifier),
    receivedAt: row.receivedAt as Date,
    identityUnverified: row.identityUnverified === true,
    unread: readUnreadSources(row.unreadSources),
  }
}

/**
 * What was stored, if it is still the shape this version expects.
 *
 * A JSON column written by an older build is data, not a type. Anything that
 * does not read back as a known group is dropped rather than shown: an
 * unrecognised warning on a review screen is worse than none, because there
 * is nothing a clinician can do about it.
 */
const SOURCE_GROUPS: readonly EhrSourceGroup[] =
  ["labs", "diagnoses", "allergies", "medications", "procedures"]

function readUnreadSources(stored: unknown): EhrUnreadSource[] {
  if (!Array.isArray(stored)) return []
  const seen = new Set<string>()
  const out: EhrUnreadSource[] = []
  for (const entry of stored) {
    if (!entry || typeof entry !== "object") continue
    const candidate = entry as { group?: unknown; errorCode?: unknown }
    const group = String(candidate.group ?? "")
    if (!SOURCE_GROUPS.includes(group as EhrSourceGroup)) continue
    if (seen.has(group)) continue
    seen.add(group)
    out.push({ group: group as EhrSourceGroup, errorCode: String(candidate.errorCode ?? "UNKNOWN") })
  }
  return out
}

/**
 * Everything this patient has already refused, across every import.
 *
 * Scoped to the patient rather than to one message on purpose. Re-proposing a
 * diagnosis somebody rejected last week, because it arrived in a different
 * file this week, teaches people to accept without reading — which is the one
 * failure that makes the whole review worthless.
 */
async function declinedKeysForPatient(
  client: EhrImportClient,
  input: {
    institutionId: string
    identifierType: PatientIdentifierType
    /**
     * The scopes that are genuinely the same person.
     *
     * This used to receive every scope a number could sit in, so that a
     * refusal recorded in December still applied to an import staged in
     * January. That is right for ЕГН, which is issued once for life. It is
     * wrong for ИЗ №, which restarts every January: last year's number 42 and
     * this year's number 42 are different patients, and carrying a refusal
     * between them suppressed an item for someone who had never seen it.
     *
     * The caller decides, because only it knows which identifier type the
     * record carries. See its comment for why the two harms are not
     * symmetrical.
     */
    identifierHashes: string[]
  },
): Promise<string[]> {
  const imports = await client.ehrImport.findMany({
    where: {
      institutionId: input.institutionId,
      identifierType: input.identifierType,
      identifierHash: { in: input.identifierHashes },
    },
    select: { id: true },
  })
  if (!imports.length) return []

  const rejected = await client.ehrImportField.findMany({
    where: {
      importId: { in: imports.map(row => String(row.id)) },
      status: "REJECTED",
    },
    select: { itemKey: true },
  })
  return rejected.map(row => String(row.itemKey))
}

/**
 * Rebuild the review plan for a staged import against the case as it stands.
 *
 * Deliberately rebuilt on every read rather than stored. The case moves while
 * an import sits waiting — the clinician types a weight, another import lands —
 * and a stored plan would go on offering values that are already there or
 * arguing with edits made since.
 */
export async function ehrReviewPlanFor(
  client: EhrImportClient,
  input: {
    importId: string
    institutionId: string
    current: Record<string, unknown>
    currentClinicalMode?: ClinicalMode | null
    /**
     * The other identity scopes the typed number could belong to, from
     * `importIdentityCandidates`. Only the route has the raw number, so only
     * the route can work these out.
     */
    identifierHashes?: string[]
    now?: Date
  },
): Promise<{ plan: EhrReviewPlan; maskedIdentifier: string } | null> {
  const now = input.now ?? new Date()
  const record = await client.ehrImport.findFirst({
    where: {
      id: input.importId,
      institutionId: input.institutionId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      maskedIdentifier: true,
      identifierType: true,
      identifierHash: true,
      fields: { select: { fieldKey: true, itemKey: true, proposedValue: true, status: true } },
    },
  })
  if (!record) return null

  // ИЗ № is reused: last year's number 42 and this year's number 42 are
  // different patients. Spanning both scopes here let a refusal recorded
  // against last year's patient suppress an item proposed for this year's --
  // and a suppressed item is one a clinician is never shown at all.
  //
  // The two harms are not symmetrical, and the appliance already says so
  // elsewhere: an allergy reported twice costs a drug choice, one omitted can
  // kill. Re-offering something the same patient rejected in December is an
  // annoyance they resolve in a second click. So for a year-scoped identifier
  // only the record's own scope counts.
  //
  // ЕГН is issued once for life and is never reused, so it keeps spanning --
  // there the extra scopes really are the same person.
  const yearScoped = record.identifierType === "IZ"
  const declinedKeys = await declinedKeysForPatient(client, {
    institutionId: input.institutionId,
    identifierType: record.identifierType as PatientIdentifierType,
    identifierHashes: yearScoped
      ? [String(record.identifierHash)]
      : [...new Set([
          String(record.identifierHash),
          ...(input.identifierHashes ?? []),
        ])],
  })

  // Items are stored one per row and regrouped into canonical fields here, so
  // Core sees exactly the shape a transport produced. A collection field keeps
  // its items in the order they arrived; ordering by draw time is Core's job,
  // not the database's.
  const grouped = new Map<string, unknown[]>()
  const scalars = new Map<string, unknown>()
  for (const row of record.fields as Record<string, unknown>[]) {
    const fieldKey = String(row.fieldKey)
    const value = row.proposedValue
    if (String(row.itemKey) === fieldKey) {
      scalars.set(fieldKey, value)
      continue
    }
    if (!grouped.has(fieldKey)) grouped.set(fieldKey, [])
    grouped.get(fieldKey)!.push(value)
  }

  const fields = [
    ...[...scalars].map(([field, value]) =>
      ({ field, shape: "scalar", value }) as never),
    ...[...grouped].map(([field, items]) => {
      const first = items[0] as Record<string, unknown> | undefined
      const shape = first && typeof first === "object" && "takenAt" in first ? "labs" : "tags"
      return { field, shape, value: items } as never
    }),
  ]

  const plan = buildEhrReviewPlan({
    canonical: {
      identifier: { type: record.identifierType as "IZ" | "EGN", value: "" },
      fields,
    },
    current: input.current,
    currentClinicalMode: input.currentClinicalMode,
    declinedKeys,
  })

  return { plan, maskedIdentifier: String(record.maskedIdentifier) }
}

/**
 * Record what the clinician decided, after they have applied the accepted
 * values through the ordinary case edit.
 *
 * Marking a field ACCEPTED here does not write anything clinical — it only
 * stops the item being offered again. That is why running this *after* the
 * patch is the safe order: a failure in between leaves the import pending and
 * self-corrects, because a value already in the case comes back `unchanged`.
 *
 * **Call it inside a transaction.** It reads the import, writes two sets of
 * decisions, counts what is left and may close the review — five statements
 * describing one act. Run loose, a failure between them leaves the acceptances
 * recorded and the refusals not, which is a review audit that says the
 * clinician did something they did not do. Nothing clinical is corrupted by
 * that; what is corrupted is the record of what was refused, and the value of
 * this screen rests on that record being true.
 *
 * The client parameter is already a transaction client's shape, so the callers
 * supply the transaction rather than this reaching for one — the same way
 * staging an import can join a transport's larger transaction.
 */
export async function recordEhrDecisions(
  client: EhrImportClient,
  input: {
    importId: string
    institutionId: string
    acceptedKeys: string[]
    declinedKeys: string[]
    userId: string
    now?: Date
  },
): Promise<{ accepted: number; declined: number; closed: boolean }> {
  const now = input.now ?? new Date()
  // Open and unexpired, the same conditions every other reader of an import
  // applies. Without them a decision could be recorded against an import that
  // was already closed, or one whose retention had run out -- writing into a
  // review nobody can still see.
  const record = await client.ehrImport.findFirst({
    where: {
      id: input.importId,
      institutionId: input.institutionId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      // Only items still awaiting a decision. A refusal is a one-way door: the
      // whole review rests on "a rejected item is not offered again", and a
      // repeated or stale request must not be able to turn one back into an
      // acceptance, nor overwrite who decided it and when.
      fields: { where: { status: "PENDING" }, select: { id: true, itemKey: true } },
    },
  })
  if (!record) throw new EhrImportError("EHR_IMPORT_NOT_FOUND")

  const rows = record.fields as Record<string, unknown>[]
  // Keys the client sends are matched against this import's own items and
  // nothing else, so a key that does not belong to it is silently ignored
  // rather than deciding something it was not offered.
  const idsFor = (keys: string[]) => {
    const wanted = new Set(keys)
    return rows.filter(row => wanted.has(String(row.itemKey))).map(row => String(row.id))
  }

  const acceptedIds = idsFor(input.acceptedKeys)
  const declinedIds = idsFor(input.declinedKeys).filter(id => !acceptedIds.includes(id))

  const decided = { decidedAt: now, decidedById: input.userId }
  // `status: PENDING` in the filter as well as the select. The rows were read
  // a moment ago; a concurrent request could have decided them since, and the
  // count that comes back is then honestly zero rather than a silent
  // overwrite of somebody else's decision.
  const accepted = acceptedIds.length
    ? (await client.ehrImportField.updateMany({
        where: { id: { in: acceptedIds }, status: "PENDING" },
        data: { status: "ACCEPTED", ...decided },
      })).count
    : 0
  const declined = declinedIds.length
    ? (await client.ehrImportField.updateMany({
        where: { id: { in: declinedIds }, status: "PENDING" },
        data: { status: "REJECTED", ...decided },
      })).count
    : 0

  // The import closes only when nothing is left undecided. A clinician who
  // takes two values now and leaves the rest must find the rest still waiting.
  const remaining = await client.ehrImportField.findMany({
    where: { importId: input.importId, status: "PENDING" },
    select: { id: true },
  })
  const closed = remaining.length === 0
  if (closed) {
    await client.ehrImport.update({
      where: { id: input.importId },
      data: { status: "REVIEWED", reviewedAt: now, reviewedById: input.userId },
    })
  }

  return { accepted, declined, closed }
}
