import type { AcceptanceTrendView, IntraopAutomationView } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { renderIntraopTabs } from "./readings-ui.js"
import { escapeHtml } from "./util.js"

/**
 * The Acceptance trend tab of the SPS page (10.3.0): for each line, how often a question or suggestion was taken
 * and how often put away, month by month. It shows which lines the clinicians have stopped using, so a line worth
 * switching off (or rewording) is found by the numbers rather than by complaint. Server-drawn, no script.
 */

/** Months with fewer answers than this are left blank in the curve: a share of two answers says nothing. */
export const TREND_MIN_ANSWERS = 3
/** Answers over the window, and the share below which a line is called rarely taken. */
export const TREND_NOISY_ANSWERS = 10
export const TREND_NOISY_SHARE = 0.2

export type TrendLine = {
  id: string
  accepted: number
  dismissed: number
  answered: number
  share: number
  /** Per month: the share taken, or null when too few answers. */
  monthly: Array<number | null>
  /** Share over the latest three months against the three before, in points; null without enough answers in both. */
  change: number | null
  noisy: boolean
}

type Counts = { accepted: number; dismissed: number }
const sum = (items: Counts[]): Counts => items.reduce((total, item) => ({ accepted: total.accepted + item.accepted, dismissed: total.dismissed + item.dismissed }), { accepted: 0, dismissed: 0 })

export function trendLines(trend: AcceptanceTrendView): TrendLine[] {
  const lines = Object.entries(trend.byId).map(([id, months]): TrendLine => {
    const total = sum(months)
    const answered = total.accepted + total.dismissed
    const monthly = months.map(item => item.accepted + item.dismissed >= TREND_MIN_ANSWERS ? item.accepted / (item.accepted + item.dismissed) : null)
    const recent = sum(months.slice(-3))
    const before = sum(months.slice(-6, -3))
    const recentAnswers = recent.accepted + recent.dismissed
    const beforeAnswers = before.accepted + before.dismissed
    const change = recentAnswers >= TREND_MIN_ANSWERS && beforeAnswers >= TREND_MIN_ANSWERS
      ? Math.round((recent.accepted / recentAnswers - before.accepted / beforeAnswers) * 100)
      : null
    const share = answered > 0 ? total.accepted / answered : 0
    return { id, ...total, answered, share, monthly, change, noisy: answered >= TREND_NOISY_ANSWERS && share < TREND_NOISY_SHARE }
  }).filter(line => line.answered > 0)
  // The rarely taken first, then by how many answers they carry.
  return lines.sort((a, b) => Number(b.noisy) - Number(a.noisy) || a.share - b.share || b.answered - a.answered)
}

/** One line's curve: the share taken per month, 0-100 %, broken where a month had too few answers. */
export function sparkline(monthly: ReadonlyArray<number | null>): string {
  const width = 132
  const height = 28
  const step = monthly.length > 1 ? (width - 8) / (monthly.length - 1) : 0
  const x = (index: number) => 4 + index * step
  const y = (share: number) => 3 + (1 - share) * (height - 6)
  const segments: string[] = []
  let current: string[] = []
  monthly.forEach((share, index) => {
    if (share == null) {
      if (current.length > 1) segments.push(current.join(" "))
      current = []
    } else current.push(`${x(index).toFixed(1)},${y(share).toFixed(1)}`)
  })
  if (current.length > 1) segments.push(current.join(" "))
  const dots = monthly.map((share, index) => share == null ? "" : `<circle cx="${x(index).toFixed(1)}" cy="${y(share).toFixed(1)}" r="1.8"/>`).join("")
  const guide = y(TREND_NOISY_SHARE).toFixed(1)
  return `<svg class="trend-spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-hidden="true"><line x1="4" x2="${width - 4}" y1="${guide}" y2="${guide}" class="trend-guide"/>${segments.map(points => `<polyline points="${points}" fill="none"/>`).join("")}${dots}</svg>`
}

export function renderAcceptancePage(trend: AcceptanceTrendView | null | undefined, automations: IntraopAutomationView | null | undefined, locale: StatusLocale): string {
  const intro = `<p>${localize(locale,
    "How each question, suggestion and reminder was received, month by month, over the finished cases of the last year. A line that is rarely taken is a line worth switching off or rewording; one that used to be taken and no longer is has changed for the clinicians. Counts only: no case, clinician or patient is named.",
    "Как всеки въпрос, предложение и напомняне е бил приет, по месеци, върху приключилите случаи през последната година. Ред, който рядко се приема, е ред за изключване или преформулиране; ред, който е бил приеман, а вече не е, се е променил за лекарите. Само броячи: не се назовава случай, лекар или пациент.")}</p>`
  if (!trend || !automations) {
    return `${renderIntraopTabs("acceptance", locale)}<div class="component" id="intraop-acceptance">${intro}<div class="empty">${localize(locale, "This API does not report the acceptance yet.", "Този API още не показва приемането.")}</div></div>`
  }
  const names = new Map(automations.automations.map(item => [item.id, item]))
  const groups = new Map(automations.groups.map(item => [item.key, item]))
  const label = (entry: { labelEn: string; labelBg: string } | undefined, fallback: string) => escapeHtml(entry ? (locale === "bg" ? entry.labelBg : entry.labelEn) : fallback)
  const lines = trendLines(trend)
  const rows = lines.map(line => {
    const item = names.get(line.id)
    const group = item ? groups.get(item.group) : undefined
    const change = line.change == null ? "—" : `${line.change > 0 ? "+" : ""}${line.change}`
    const direction = line.change == null ? "" : line.change <= -10 ? " data-falling" : line.change >= 10 ? " data-rising" : ""
    return `<tr data-testid="trend-row" data-id="${escapeHtml(line.id)}"${line.noisy ? " data-noisy" : ""}>
<td>${label(item, line.id)}${group ? `<span class="component-detail"> ${label(group, "")}</span>` : ""}</td>
<td>${sparkline(line.monthly)}</td>
<td class="num">${line.answered}</td>
<td class="num">${Math.round(line.share * 100)} %${line.noisy ? ` <span class="intraop-stat" data-noisy>${localize(locale, "rarely taken", "рядко се приема")}</span>` : ""}</td>
<td class="num"${direction}>${change}</td></tr>`
  }).join("")
  const quiet = Object.keys(trend.byId).length - lines.length
  const casesRow = `<p class="component-detail" data-testid="trend-cases">${localize(locale, "Finished cases per month", "Приключили случаи по месеци")}: ${trend.months.map((month, index) => `${escapeHtml(month)} ${trend.cases[index] ?? 0}`).join(" · ")}</p>`
  const percent = Math.round(TREND_NOISY_SHARE * 100)
  const table = lines.length === 0
    ? `<div class="empty" data-testid="trend-empty">${localize(locale, "No suggestion was answered in the finished cases of the last year yet.", "Още няма отговорено предложение в приключилите случаи през последната година.")}</div>`
    : `<table class="trend-table" data-testid="trend-table"><thead><tr><th>${localize(locale, "Line", "Ред")}</th><th>${localize(locale, "Share taken, by month", "Дял приети, по месеци")}</th><th>${localize(locale, "Answers", "Отговори")}</th><th>${localize(locale, "Taken", "Приети")}</th><th title="${localize(locale, "Latest three months against the three before, in percentage points", "Последните три месеца спрямо предишните три, в процентни пункта")}">${localize(locale, "Change", "Промяна")}</th></tr></thead><tbody>${rows}</tbody></table>
<p class="component-detail">${localize(locale,
      `The curve is blank in a month with fewer than ${TREND_MIN_ANSWERS} answers; the dotted guide marks ${percent} %. Rarely taken means ${TREND_NOISY_ANSWERS} answers or more with fewer than ${percent} % taken.`,
      `Кривата е празна за месец с по-малко от ${TREND_MIN_ANSWERS} отговора; пунктираната линия отбелязва ${percent} %. Рядко се приема означава ${TREND_NOISY_ANSWERS} отговора или повече с под ${percent} % приети.`)}${quiet > 0 ? ` ${quiet} ${localize(locale, "lines had no answers.", "реда нямат отговори.")}` : ""}</p>`
  return `${renderIntraopTabs("acceptance", locale)}<div class="component" id="intraop-acceptance">${intro}${casesRow}${table}</div>`
}

export const ACCEPTANCE_STYLE = `.trend-table{width:100%;border-collapse:collapse;margin:.5rem 0}.trend-table th,.trend-table td{padding:.35rem .5rem;border-bottom:1px solid var(--line,#e2e8f0);text-align:left;vertical-align:middle}.trend-table .num{text-align:right;font-variant-numeric:tabular-nums}.trend-spark{display:block}.trend-spark polyline{stroke:var(--accent,#1d4ed8);stroke-width:1.6}.trend-spark circle{fill:var(--accent,#1d4ed8)}.trend-spark .trend-guide{stroke:var(--muted,#94a3b8);stroke-width:.6;stroke-dasharray:2 2}.trend-table [data-falling]{color:var(--danger,#b42318);font-weight:700}.trend-table [data-rising]{color:var(--ok,#067647);font-weight:700}.trend-table tr[data-noisy]{background:color-mix(in srgb,var(--danger,#b42318) 6%,transparent)}.trend-table td:first-child{min-width:14rem}`
