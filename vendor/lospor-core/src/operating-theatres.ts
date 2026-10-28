/**
 * Operating theatres (10.0.0): which theatre a case is in. Optional, off by
 * default, switched on and named in Status (appliance); nothing is bundled.
 *
 * A theatre can be assigned and changed until intraoperative care starts.
 * From then the case keeps the name the theatre had when it started, so a
 * later rename or retirement in Status does not rewrite where it happened.
 *
 * Hospital logistics, not clinical data: printed on the record, left out of
 * every research export.
 */

/** A theatre as clinicians pick it. */
export type OperatingTheatre = { id: string; name: string }

/** Whether the site uses theatres, and the ones it offers (active, in order). */
export type OperatingTheatreConfig = { enabled: boolean; theatres: OperatingTheatre[] }

export const OPERATING_THEATRES_OFF: OperatingTheatreConfig = Object.freeze({ enabled: false, theatres: Object.freeze([]) as unknown as OperatingTheatre[] })

export const MAX_THEATRE_NAME_LENGTH = 60

/** A theatre's name as stored: trimmed, inner spaces collapsed; null when empty or too long. */
export function normalizeTheatreName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.replace(/\s+/g, " ").trim()
  return name.length > 0 && name.length <= MAX_THEATRE_NAME_LENGTH ? name : null
}

type IntraopTimes = { startedAt?: unknown; startTime?: unknown } | null | undefined

/** Intraoperative care has started: the record carries a start (an instant, or a legacy wall clock). */
export function intraopHasStarted(intraop: IntraopTimes): boolean {
  return Boolean(intraop && (intraop.startedAt || intraop.startTime))
}

/** Whether a case's theatre can still be assigned or changed: until intraop starts. */
export function theatreChangeAllowed(caseRecord: { status?: string | null; intraop?: IntraopTimes }): boolean {
  // A finalised or cancelled case keeps the theatre it has (10.0.0).
  return caseRecord.status !== "COMPLETE" && caseRecord.status !== "CANCELLED" && !intraopHasStarted(caseRecord.intraop)
}

/**
 * The theatre a case shows: the name frozen when it started, else the
 * theatre's name now. Null when none was assigned.
 */
export function caseTheatreName(caseRecord: {
  operatingTheatreName?: string | null
  operatingTheatre?: { name: string } | null
}): string | null {
  return caseRecord.operatingTheatreName ?? caseRecord.operatingTheatre?.name ?? null
}

/** What the API sends with a case: its theatre, if any, and whether it can still change. */
export type CaseTheatreView = { id: string | null; name: string | null; changeable: boolean }

export function caseTheatreView(caseRecord: {
  status?: string | null
  intraop?: IntraopTimes
  operatingTheatreId?: string | null
  operatingTheatreName?: string | null
  operatingTheatre?: { name: string } | null
}): CaseTheatreView {
  return {
    id: caseRecord.operatingTheatreId ?? null,
    name: caseTheatreName(caseRecord),
    changeable: theatreChangeAllowed(caseRecord),
  }
}

/** Reads the API's theatre configuration; anything malformed reads as off. */
export function parseOperatingTheatreConfig(value: unknown): OperatingTheatreConfig {
  if (!value || typeof value !== "object") return OPERATING_THEATRES_OFF
  const record = value as Record<string, unknown>
  if (record.enabled !== true || !Array.isArray(record.theatres)) return OPERATING_THEATRES_OFF
  const theatres = record.theatres.flatMap(entry => {
    if (!entry || typeof entry !== "object") return []
    const { id, name } = entry as Record<string, unknown>
    return typeof id === "string" && typeof name === "string" ? [{ id, name }] : []
  })
  return { enabled: true, theatres }
}
