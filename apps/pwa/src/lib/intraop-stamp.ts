import type { LogEvent } from "@/lib/intraop-log-event"
import { intraopStampForColumn } from "@lospor/core/intraop-commands"
import { intraopColumnForInstant } from "@lospor/core/intraop-engine"

/**
 * A timestamp chosen by tapping a chart row. `save` resolves it with the Core
 * stamp rule: the exact minute when the row is the one "now" falls in,
 * otherwise the start of the row. A stop entered in the 21:30 row therefore
 * records 21:30, never the moment the button was pressed.
 */
export type RowStamp = { rowTs: string | null }

/** A stamp for the row tapped, or for now when there is no row (never a stale sheet time). */
export function atRow(rowTs: string | null | undefined): RowStamp {
  return { rowTs: rowTs ?? null }
}

/** Resolves a row time to the instant to record; the shape every entry hook receives. */
export type StampFor = (rowTs?: string | null) => string

/** The instant to record for an entry made in a row, or now when there is no row. */
export function resolveRowStamp(
  rowTs: string | null | undefined,
  chartStart: Date | null,
  now: Date = new Date(),
): string {
  if (!rowTs || !chartStart) return new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString()
  return intraopStampForColumn({
    chartStart,
    column: intraopColumnForInstant(rowTs, chartStart),
    now,
  })
}

/**
 * The shared persistence call every intraop entry hook receives. A string is
 * an exact instant; a RowStamp is resolved with the stamp rule; omitted means
 * the row the sheet was opened from, or now. Resolves to null when the
 * timeline rules refuse the entry.
 */
export type SaveIntraopEvent = (
  partial: Omit<LogEvent, "id" | "ts">,
  tsOverride?: string | RowStamp,
  silent?: boolean,
) => Promise<LogEvent | null>
