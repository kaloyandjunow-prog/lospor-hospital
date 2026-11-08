/**
 * What the Investigations box on the printed record shows, and what it cannot.
 *
 * Lifted out of `CaseSummary` because that component is under a size budget the
 * build enforces, and because this is decision logic rather than markup: which
 * draws are shown, in what order, and how much is left behind. It is testable
 * on its own here in a way it was not inside a 980-line component.
 */

export type LabResultItem = {
  test?: string
  value?: string
  unit?: string
  takenAt?: string | null
}

export type LabDraw = {
  at: string | null
  label: string
  results: LabResultItem[]
}

/**
 * The laboratory results this anaesthetic produced, grouped by draw.
 *
 * **Intraoperative only.** The preoperative panel used to be what the box
 * held, and it is the one thing on the sheet the hospital already has: it came
 * from their laboratory and it is in their record. What is not in their record
 * is the gas taken at induction and the one after transfusion, which exist here
 * and nowhere else. The sheet is the anaesthetic record, so it carries what the
 * anaesthetist did rather than reprinting the hospital's own results back at it.
 *
 * Grouped rather than flattened, because `takenAt` is recorded per draw on
 * purpose: a blood gas at induction and another after transfusion are two draws,
 * not an edit of one, and a merged list cannot tell them apart.
 */
export function groupLabDraws(
  rows: unknown,
  undatedLabel: string,
  formatTime: (at: string) => string,
): LabDraw[] {
  const all = Array.isArray(rows) ? (rows as LabResultItem[]) : []
  const withValue = all.filter(l => l.value !== null && l.value !== undefined && String(l.value) !== "")

  const byDraw = new Map<string, LabResultItem[]>()
  for (const row of withValue) {
    // An undated result is its own group rather than being folded into the
    // first dated one: saying when it was taken is the whole point, and
    // guessing would put a result under a time it does not belong to.
    const key = typeof row.takenAt === "string" ? row.takenAt : ""
    const bucket = byDraw.get(key)
    if (bucket) bucket.push(row)
    else byDraw.set(key, [row])
  }

  return [...byDraw.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([at, results]) => ({
      at: at || null,
      label: at ? formatTime(at) : undatedLabel,
      results,
    }))
}
