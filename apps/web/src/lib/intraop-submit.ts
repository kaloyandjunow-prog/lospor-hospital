import { INTRAOP_COLUMN_MINUTES } from "@lospor/core/intraop-engine"
import { buildIntraopEndTiming, isValidTimeZone, resolvedTimeZone } from "@/lib/intraop-time"

/**
 * Turning the intraoperative timetable into the payload the API stores.
 *
 * Lifted out of `IntraopForm` because none of it touches the form: it is
 * arithmetic over the timetable and the event log, and it is the part most
 * worth having a test around — a column index converted to the wrong wall
 * clock puts every drug in the case at the wrong minute.
 */

/**
 * A wall-clock time N minutes after another, wrapping at midnight.
 *
 * The timetable counts columns from the case start, so a case that runs past
 * midnight produces column indices beyond 24 hours' worth. Wrapping rather than
 * overflowing keeps those readable as times; the date they belong to is carried
 * by `startedAt`/`endedAt` on the record, not by this string.
 */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = (hhmm || "00:00").split(":").map(Number)
  const total = (h * 60 + m + minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

type TimetableVital = Record<string, unknown> & { time?: string }
type TimetableInfusion = { name: string; rate: number | string; unit: string; startCol: number }
type TimetableDrug = { name: string; dose: string; unit: string; colIdx: number }

export type IntraopTimetableState = {
  vitals?: TimetableVital[]
  infusions?: TimetableInfusion[]
  drugs?: TimetableDrug[]
}

export type AdministeredEntry = {
  name: string
  dose: string
  unit: string
  route: string
  time: string
}

/**
 * The vitals, drugs and infusions a submit should carry, at wall-clock times.
 *
 * Columns are positions on the chart; the API stores times. Empty vital columns
 * are dropped rather than sent as rows of nulls — a column exists because the
 * chart has one, not because anything was recorded in it, and a row of nulls at
 * every five minutes would be indistinguishable from a measurement of nothing.
 */
export function buildIntraopSubmission(
  timetable: IntraopTimetableState,
  startTime: string,
): { vitals: TimetableVital[]; drugsAdministered: AdministeredEntry[] } {
  const vitals = (timetable.vitals ?? [])
    .map((v, i) => ({ ...v, time: addMinutes(startTime, i * INTRAOP_COLUMN_MINUTES) }))
    .filter(v => Object.values(v).some(x => x != null && x !== v.time))

  const infusionEntries: AdministeredEntry[] = (timetable.infusions ?? []).map(inf => ({
    name: inf.name,
    dose: String(inf.rate),
    unit: inf.unit,
    route: "Infusion",
    time: addMinutes(startTime, inf.startCol * INTRAOP_COLUMN_MINUTES),
  }))

  const bolusDrugs: AdministeredEntry[] = (timetable.drugs ?? []).map(d => ({
    name: d.name,
    dose: d.dose,
    unit: d.unit,
    route: "IV",
    time: addMinutes(startTime, d.colIdx * INTRAOP_COLUMN_MINUTES),
  }))

  return { vitals, drugsAdministered: [...bolusDrugs, ...infusionEntries] }
}

/**
 * Which of the two time fields a readiness blocker is about.
 *
 * The readiness check reports codes; the form highlights fields. An invalid
 * *range* implicates both ends, because from the form's side there is no way to
 * know which of the two the user meant to be different.
 */
export function intraopTimeErrors(blockerCodes: Iterable<string>): {
  startTime: boolean
  endTime: boolean
} {
  const codes = new Set(blockerCodes)
  const invalidRange = codes.has("invalid_intraop_times")
  return {
    startTime: codes.has("missing_start_time") || invalidRange,
    endTime: codes.has("missing_end_time") || invalidRange,
  }
}

/**
 * The form values an intraoperative autosave sends (9.12.1). `vitals` and
 * `drugsAdministered` are read off the chart, which is saved as events; the
 * form never edits them. The server does not return them either, so an
 * autosave that included them always differed from what was loaded: each save
 * refreshed the case, and the refresh saved again, several times a second.
 * Continue still sends the chart's values once, through the submission.
 */
export function intraopAutosaveValues<T extends { vitals?: unknown; drugsAdministered?: unknown }>(
  values: T,
): Omit<T, "vitals" | "drugsAdministered"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { vitals, drugsAdministered, ...rest } = values
  return rest
}

/**
 * The form values End case sets: the end in the case's zone (the browser's
 * when none is saved) and whether it falls on the next day. Moved out of the
 * form unchanged in 9.12.1.
 */
export function intraopEndCaseValues(now: Date, savedZone: string | null | undefined, startTime: string | null | undefined): {
  endTime: string
  endedAt: string | null
  timezone: string | null
  endTimeNextDay: boolean
} {
  const zone = isValidTimeZone(savedZone) ? savedZone : resolvedTimeZone()
  const timing = zone ? buildIntraopEndTiming(now, zone) : null
  const [sh, sm] = (startTime || "00:00").split(":").map(Number)
  return {
    endTime: timing?.endTime ?? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    endedAt: timing?.endedAt ?? null,
    timezone: timing?.timezone ?? null,
    // The case crossed midnight.
    endTimeNextDay: now.getHours() * 60 + now.getMinutes() < sh * 60 + sm,
  }
}
