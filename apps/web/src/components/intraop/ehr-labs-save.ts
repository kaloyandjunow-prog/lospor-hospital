import type { IntraopData } from "@/components/forms/intraopSchema"

/**
 * Hospital: what the intraoperative lab import writes, and when it counts.
 *
 * Accepted results were only put in the form, left for the next autosave, and
 * recorded as accepted at once. A save refused, or lost with the tab, left the
 * import read as accepted though the case never had its results. So the
 * import saves the section at once and learns whether that landed.
 */
export function ehrLabsWriter<Row>(
  setRows: (rows: Row[]) => void,
  snapshot: () => Record<string, unknown>,
  onSaveNow: ((data: IntraopData) => Promise<boolean>) | undefined,
): (rows: Row[]) => Promise<boolean> {
  return async rows => {
    setRows(rows)
    // With nothing to save through, nothing can be said to have landed.
    return onSaveNow ? onSaveNow({ ...snapshot(), labResults: rows } as unknown as IntraopData) : false
  }
}

/** A section save that reached the server, or is durably queued to. */
export function sectionSaveKept(saved: unknown): boolean {
  return saved === true || saved === "queued"
}
