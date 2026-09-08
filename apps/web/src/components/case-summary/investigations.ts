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

/**
 * How many results the box holds before the page starts losing them.
 *
 * Measured with the real stylesheet through a browser, not chosen: at 120
 * results the flat list this replaced silently lost 28, and once per-draw
 * headings were counted a limit of 60 still drew ten items past the bottom
 * edge. Both A4 pages are a fixed box with `overflow: hidden`, so anything
 * past that edge is cut off and never printed.
 */
export const LAB_PRINT_LIMIT = 48

/**
 * What fits on the paper, and what is left over.
 *
 * Newest first, because a sheet read at handover is read for the latest
 * picture. The draw that straddles the limit is shown in part rather than
 * dropped whole: a single large panel would otherwise take the box from full to
 * empty, and an empty box on a patient who had ten gases is the worst of the
 * available outcomes.
 *
 * A record that is short is fine. One that is short and silent about being
 * short is not, which is why the count of what was left behind comes back with
 * the draws that fit.
 */
export function fitLabDraws(draws: LabDraw[], limit = LAB_PRINT_LIMIT): {
  shownDraws: LabDraw[]
  omittedResults: number
  omittedDraws: number
} {
  const total = draws.reduce((sum, d) => sum + d.results.length, 0)
  if (total <= limit) return { shownDraws: draws, omittedResults: 0, omittedDraws: 0 }

  const shown: LabDraw[] = []
  let budget = limit
  let omitted = 0
  for (const draw of [...draws].reverse()) {
    if (budget <= 0) { omitted += draw.results.length; continue }
    if (draw.results.length <= budget) {
      budget -= draw.results.length
      shown.unshift(draw)
      continue
    }
    shown.unshift({ ...draw, results: draw.results.slice(-budget) })
    omitted += draw.results.length - budget
    budget = 0
  }
  return { shownDraws: shown, omittedResults: omitted, omittedDraws: draws.length - shown.length }
}

/**
 * The drug log, split across sheets rather than clipped.
 *
 * Unlike the laboratory box this continues rather than capping. A drug given is
 * a fact about what was done to the patient and the record has to carry all of
 * them; a result not shown can be looked up, a dose nobody recorded on paper
 * cannot.
 *
 * Measured the same way: the panel on sheet 1 holds about 94 entries, and a
 * hundred loses six of them silently -- the six nearest handover.
 */
export const DRUG_LOG_SHEET_LIMIT = 80
export const DRUG_LOG_CONT_LIMIT = 160

export function splitDrugLog<T>(entries: T[]): { first: T[]; continued: T[][] } {
  const continued: T[][] = []
  for (let at = DRUG_LOG_SHEET_LIMIT; at < entries.length; at += DRUG_LOG_CONT_LIMIT) {
    continued.push(entries.slice(at, at + DRUG_LOG_CONT_LIMIT))
  }
  return { first: entries.slice(0, DRUG_LOG_SHEET_LIMIT), continued }
}
