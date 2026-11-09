import { ControlPlaneClientError, type IntraopAutomationUpdate, type IntraopAutomationView, type IntraopReadingsView } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { readingsMath } from "./readings-script.js"
import { escapeHtml } from "./util.js"

/**
 * The Unusual readings tab of the SPS page (10.2.0): how unusual a reading must be before the chart asks whether to
 * log hypotension, bradycardia or tachycardia, set per age band and sign from this hospital's own readings. It saves
 * the limits and the cases a band needs, and nothing else on the SPS page.
 *
 * Without scripting the page still works: the limits are plain selects. With it, sliders drive those selects and
 * the chart, the share of cases a limit would ask about and the history of the limits redraw as they move.
 */

export const INTRAOP_READINGS_PATH = "/status/control/intraop/readings"
export const INTRAOP_ACCEPTANCE_PATH = "/status/control/intraop/acceptance"
const ANCHOR = "intraop-readings"

const fail = () => new ControlPlaneClientError("INTRAOP_AUTOMATION_INVALID")

/** The tabs of the SPS page, in the chips every skin uses for a page's tabs (the preoperative form's are the same). */
export function renderIntraopTabs(active: "switches" | "readings" | "acceptance" | "cards", locale: StatusLocale): string {
  const tabs: Array<["switches" | "readings" | "acceptance" | "cards", string, string]> = [
    ["switches", "/status/control/intraop", localize(locale, "Switches", "Превключватели")],
    ["readings", INTRAOP_READINGS_PATH, localize(locale, "Unusual readings", "Необичайни показания")],
    ["acceptance", INTRAOP_ACCEPTANCE_PATH, localize(locale, "Acceptance trend", "Тенденция на приемане")],
    ["cards", "/status/control/intraop/cards", localize(locale, "Card preview", "Преглед на карти")],
  ]
  return `<nav class="statusnav subnav preop-tabs" aria-label="${localize(locale, "SPS — Smart Prediction System", "SPS — Система за интелигентно прогнозиране")}">${tabs.map(([id, href, name]) =>
    `<a href="${href}"${id === active ? ' aria-current="page"' : ""}>${name}</a>`).join("")}</nav>`
}

/** The words the browser script writes, in the page's language. */
export function readingsStrings(locale: StatusLocale): Record<string, string> {
  const t = (en: string, bg: string) => localize(locale, en, bg)
  return {
    tachycardiaAbove: t("Tachycardia >", "Тахикардия >"),
    bradycardiaBelow: t("Bradycardia <", "Брадикардия <"),
    hypotensionBelow: t("Hypotension: {sign} <", "Хипотенсия: {sign} <"),
    noReadings: t("No readings of this kind yet.", "Още няма такива показания."),
    noReadingsBand: t("This band has no readings yet. Only the fixed rules ask.", "Тази група още няма показания. Питат само фиксираните правила."),
    collecting: t("Collecting data", "Събират се данни"),
    collectingDetail: t("{n} of {m} cases. Only the fixed rules ask in this band for now; the chart shows what the limits would be.", "{n} от {m} случая. Засега в тази група питат само фиксираните правила; графиката показва какви биха били границите."),
    active: t("Statistics active", "Статистиката е активна"),
    activeDetail: t("{cases} cases · {readings} readings · mean {mean}, SD {sd} {unit}", "{cases} случая · {readings} показания · средно {mean}, SD {sd} {unit}"),
    sdScale: t("SD scale", "Скала в SD"),
    mean: t("mean", "средно"),
    lowestShare: t("lowest {n}%", "най-ниските {n}%"),
    highestShare: t("highest {n}%", "най-високите {n}%"),
    noHighQuestion: t("No question is asked at the high end: hypertension is judged on the patient's own baseline.", "Отгоре не се задава въпрос: хипертенсията се преценява по изходната стойност на самия пациент."),
    question: t("Question", "Въпрос"),
    statistics: t("Statistics", "Статистика"),
    fixedRules: t("Fixed rules", "Фиксирани правила"),
    hypotension: t("Hypotension", "Хипотенсия"),
    bradycardia: t("Bradycardia", "Брадикардия"),
    tachycardia: t("Tachycardia", "Тахикардия"),
    hypertension: t("Hypertension", "Хипертенсия"),
    hypertensionBaseline: t("Judged on the patient's own baseline ({p}% above it), not on these limits.", "Преценява се по изходната стойност на пациента ({p}% над нея), не по тези граници."),
    wouldBe: t("If statistics were active:", "Ако статистиката беше активна:"),
    impactNote: t("Cases of the last {n} finished in this band that have at least one reading past a limit.", "Случаи от последните {n} приключили в тази група, поне едно показание на които е извън граница."),
    noHistory: t("Not enough history yet.", "Още няма достатъчно история."),
    lastMonths: t("last {n} months", "последните {n} месеца"),
    statisticsOn: t("statistics on ({n} cases)", "статистиката е включена ({n} случая)"),
    sinceOn: t("Since statistics started: low {lo0} → {lo1}", "Откакто статистиката е включена: ниско {lo0} → {lo1}"),
    sinceHigh: t("high {hi0} → {hi1}", "високо {hi0} → {hi1}"),
    notActiveYet: t("Not active yet: {n} of {m} cases", "Още не е активна: {n} от {m} случая"),
  }
}

const noScriptLimits = (view: IntraopReadingsView, bandKey: string, signKey: string, tails: { low: number; high: number }) => {
  const histogram = view.stats[bandKey]?.[signKey]
  if (!histogram) return { low: null, high: null }
  return readingsMath.limitsOf(histogram, tails.low, tails.high)
}

/** The data block the script reads: the view and the strings, with nothing that could close the script element. */
function dataBlock(view: IntraopReadingsView, locale: StatusLocale): string {
  const json = JSON.stringify({
    locale,
    tailSteps: view.tailSteps,
    defaultTail: view.defaultTail,
    minCasesRange: view.minCasesRange,
    hypertensionUsesStatistics: view.hypertensionUsesStatistics,
    config: { minCases: view.config.minCases, hypertensionBaselinePercent: view.config.hypertensionBaselinePercent ?? null },
    bands: view.bands,
    signs: view.signs,
    stats: view.stats,
    cases: view.cases,
    history: view.history,
    strings: readingsStrings(locale),
  }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
  return `<script type="application/json" id="ur-data">${json}</script>`
}

/** Hospital control · SPS · Unusual readings. */
export function renderReadingsPage(view: IntraopReadingsView | null | undefined, locale: StatusLocale): string {
  const intro = `<p>${localize(locale,
    "Set how unusual a reading must be before the chart asks whether to log hypotension, bradycardia or tachycardia. The limits come from this hospital's own readings, per age band, and the fixed rules always stay on beside them. Hypertension is judged on the patient's own baseline, set on the Switches tab.",
    "Задайте колко необичайно трябва да е едно показание, преди графиката да попита дали да запише хипотенсия, брадикардия или тахикардия. Границите идват от показанията на самата болница по възрастови групи, а фиксираните правила винаги остават до тях. Хипертенсията се преценява по изходната стойност на самия пациент и се задава в раздела „Превключватели“.")}</p>`
  if (!view) {
    return `${renderIntraopTabs("readings", locale)}<div class="component" id="${ANCHOR}">${intro}<div class="empty">${localize(locale, "This API does not report the readings yet.", "Този API още не показва показанията.")}</div></div>`
  }
  const label = (entry: { labelEn: string; labelBg: string }) => escapeHtml(locale === "bg" ? entry.labelBg : entry.labelEn)
  const tailOptions = (selected: number) => view.tailSteps.map(step => `<option value="${step}"${step === selected ? " selected" : ""}>${String(step).replace(".", ",")} %</option>`).join("")

  // Every limit is a select: the form's own fields, and the whole page when scripting is off.
  const percentText = (value: number | null) => value == null ? "—" : String(value)
  const rows = view.bands.map(band => {
    const cells = view.signs.map(sign => {
      const pair = view.config.tails[band.key]?.[sign.key] ?? { low: view.defaultTail, high: view.defaultTail }
      const name = `tail_${escapeHtml(band.key)}_${escapeHtml(sign.key)}`
      const limits = noScriptLimits(view, band.key, sign.key, pair)
      const askedHigh = view.hypertensionUsesStatistics || sign.key === "hr"
      return `<td><span class="intraop-pair"><select name="${name}_low" aria-label="${label(sign)}, ${localize(locale, "low end", "ниският край")} — ${label(band)}">${tailOptions(pair.low)}</select><select name="${name}_high" aria-label="${label(sign)}, ${localize(locale, "high end", "високият край")} — ${label(band)}"${askedHigh ? "" : " data-asks-nothing"}>${tailOptions(pair.high)}</select></span><span class="component-detail ur-now">&lt; ${percentText(limits.low)}${askedHigh ? ` · &gt; ${percentText(limits.high)}` : ""}</span></td>`
    }).join("")
    const cases = view.stats[band.key]?.hr?.cases ?? 0
    const active = cases >= view.config.minCases
    return `<tr data-band="${escapeHtml(band.key)}"><th scope="row">${label(band)}<span class="component-detail">${cases} ${localize(locale, "cases", "случая")} · ${active ? localize(locale, "statistics active", "статистиката е активна") : localize(locale, "collecting", "събират се данни")}</span></th>${cells}</tr>`
  }).join("")
  const signHeads = view.signs.map(sign => `<th>${label(sign)}<span class="component-detail">${localize(locale, "low · high", "ниско · високо")}</span></th>`).join("")

  const widget = `<div class="ur" id="ur" data-testid="readings-widget">
<div class="ur-bandbar"><span class="ur-label">${localize(locale, "Age band", "Възрастова група")}</span><div class="ur-chips" id="ur-bands" role="group"></div></div>
<div class="ur-grid">
<section class="ur-card"><div class="ur-tabs" id="ur-tabs" role="tablist"></div><div class="ur-state" id="ur-state"></div>
<div class="ur-chartbox"><svg id="ur-chart" viewBox="0 0 760 300" role="img" aria-label="${localize(locale, "Distribution of readings with limits", "Разпределение на показанията с граници")}"></svg></div>
<div class="ur-sliders">
<div class="ur-slider"><div class="ur-slidertop"><label for="ur-lo">${localize(locale, "Low limit", "Долна граница")}</label><b id="ur-lo-text"></b></div><input id="ur-lo" type="range" min="0" max="${view.tailSteps.length - 1}" step="1" value="0"><div class="ur-ticks">${view.tailSteps.map(step => `<span>${String(step).replace(".", ",")}</span>`).join("")}</div></div>
<div class="ur-slider" id="ur-hi-card"><div class="ur-slidertop"><label for="ur-hi">${localize(locale, "High limit", "Горна граница")}</label><b id="ur-hi-text"></b></div><input id="ur-hi" type="range" min="0" max="${view.tailSteps.length - 1}" step="1" value="0"><div class="ur-ticks">${view.tailSteps.map(step => `<span>${String(step).replace(".", ",")}</span>`).join("")}</div></div>
</div>
<p class="component-detail">${localize(locale, "The sliders set the share of this band's readings counted as unusual at each end, for the selected sign. Each sign in each band keeps its own setting. The dashed purple line is the fixed rule.", "Плъзгачите задават дела от показанията на тази група, считан за необичаен във всеки край, за избрания показател. Всеки показател във всяка група има собствена настройка. Лилавата прекъсната линия е фиксираното правило.")}</p></section>
<aside class="ur-side"><section class="ur-card"><div class="ur-label">${localize(locale, "With these limits", "С тези граници")}</div>
<div><span class="ur-big" id="ur-any"></span> <span class="component-detail">${localize(locale, "of cases in this band would get at least one question from the statistics", "от случаите в тази група биха получили поне един въпрос от статистиката")}</span></div>
<div><span class="ur-big small" id="ur-any-all"></span> <span class="component-detail">${localize(locale, "with the fixed rules too", "и с фиксираните правила")}</span></div>
<table class="ur-impact" id="ur-impact"></table><p class="component-detail" id="ur-impact-note"></p></section>
<section class="ur-preview" id="ur-preview" aria-label="${localize(locale, "What the clinician sees", "Какво вижда лекарят")}"><div class="ur-label">${localize(locale, "What the clinician sees", "Какво вижда лекарят")}</div><div class="ur-q" id="ur-pv-title"></div><div class="component-detail" id="ur-pv-detail"></div><div class="component-detail" id="ur-pv-stop"></div></section></aside>
</div>
<section class="ur-card"><div class="ur-foot"><div><div class="ur-label">${localize(locale, "How the limits moved", "Как са се движили границите")}</div><div class="component-detail" id="ur-hist-sub"></div></div><div class="component-detail" id="ur-hist-now"></div></div>
<div class="ur-chartbox"><svg id="ur-hist" viewBox="0 0 760 240" role="img" aria-label="${localize(locale, "The limits over time", "Границите във времето")}"></svg></div>
<p class="component-detail">${localize(locale, "Each point is the limit as it stood at the end of that month, from all readings so far, at the slider setting. Before the band reached the minimum the line is dotted: those limits were not used.", "Всяка точка е границата в края на съответния месец, от всички показания дотогава, при настройката на плъзгача. Преди групата да достигне минимума линията е точкована: тези граници не са били използвани.")}</p></section>
</div>`

  const form = `<form method="post" action="${INTRAOP_READINGS_PATH}#${ANCHOR}" id="ur-form" data-testid="readings-form">
<div class="ur-selects"><p class="component-detail">${localize(locale, "Each limit is the share of a band's readings counted as unusual at that end. Smaller shares ask less often.", "Всяка граница е делът от показанията на групата, считан за необичаен в този край. По-малките дялове питат по-рядко.")}</p>
<table class="ind-bands intraop-tails"><thead><tr><th>${localize(locale, "Age band", "Възрастова група")}</th>${signHeads}</tr></thead><tbody>${rows}</tbody></table></div>
<label class="ur-min">${localize(locale, "Statistics start after this many cases in a band", "Статистиката започва след толкова случая в групата")}<span class="ind-inline"><input class="ind-number" name="minCases" inputmode="numeric" required value="${view.config.minCases}" data-testid="readings-min-cases"></span><span class="component-detail">${localize(locale, "bundled", "вградено")}: ${view.defaultMinCases} · ${view.minCasesRange.min}–${view.minCasesRange.max}. ${localize(locale, "Until then only the fixed rules ask.", "Дотогава питат само фиксираните правила.")}</span></label>
<div class="ur-actions"><button type="button" class="ur-reset" id="ur-reset" hidden>${localize(locale, "Reset this band", "Нулиране на тази група")}</button></div>
<label>${localize(locale, "Reason for the change", "Причина за промяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save the limits", "Запазване на границите")}</button>
</form>`

  return `${renderIntraopTabs("readings", locale)}<div class="component" id="${ANCHOR}">${intro}${widget}${form}${dataBlock(view, locale)}<script src="/status/unusual-readings.js" defer></script></div>`
}

/**
 * What the Unusual readings form saves: the limits and the cases a band needs, over the settings already in force.
 * Everything else on the SPS page is left exactly as it is, so this form can never switch a group off by omission.
 */
export function readingsUpdateFromForm(view: IntraopAutomationView, body: Record<string, unknown>, reason: string): IntraopAutomationUpdate {
  const minCasesRaw = typeof body.minCases === "string" ? body.minCases.trim() : ""
  const minCases = Number(minCasesRaw)
  const { min, max } = view.minCasesRange
  if (minCasesRaw === "" || !Number.isInteger(minCases) || minCases < min || minCases > max) throw fail()
  const tails: IntraopAutomationUpdate["vitalQuestions"]["tails"] = {}
  for (const band of view.bands) {
    tails[band.key] = {}
    for (const sign of view.signs) {
      const read = (end: "low" | "high") => {
        const raw = body[`tail_${band.key}_${sign.key}_${end}`]
        const value = Number(typeof raw === "string" ? raw.replace(",", ".") : NaN)
        if (!view.tailSteps.includes(value)) throw fail()
        return value
      }
      tails[band.key][sign.key] = { low: read("low"), high: read("high") }
    }
  }
  return { ...view.config, vitalQuestions: { ...view.config.vitalQuestions, minCases, tails }, reason }
}

export const READINGS_STYLE = `.ur{display:grid;gap:1rem;margin:.6rem 0 1rem}.ur-label{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#5f6779)}
.ur-card{background:var(--card,#fff);border:1px solid var(--line,#dde2ec);border-radius:12px;padding:1rem;display:grid;gap:.8rem;min-width:0}
.ur-bandbar{display:grid;gap:.4rem}.ur-chips{display:flex;flex-wrap:wrap;gap:.4rem}
.ur-chip{border:1px solid var(--line,#dde2ec);background:var(--sunk,#eef1f6);color:var(--ink,#1a1f2b);border-radius:999px;padding:.3rem .8rem;font:inherit;font-size:.875rem;cursor:pointer;display:inline-flex;gap:.4rem;align-items:center;margin:0;min-height:0}
.ur-chip[aria-pressed=true]{background:var(--ink,#1a1f2b);color:var(--card,#fff);border-color:var(--ink,#1a1f2b)}.ur-dot{width:.5rem;height:.5rem;border-radius:50%;background:var(--good,#13875a)}.ur-dot.collect{background:var(--warn,#b86e00)}
.ur-grid{display:grid;grid-template-columns:minmax(0,1fr) 20rem;gap:1rem;align-items:start}@media(max-width:900px){.ur-grid{grid-template-columns:minmax(0,1fr)}}
.ur-side{display:grid;gap:1rem}.ur-tabs{display:flex;flex-wrap:wrap;gap:.1rem;border-bottom:1px solid var(--line,#dde2ec)}
.ur-tab{border:0;border-bottom:2px solid transparent;background:none;color:var(--muted,#5f6779);font:inherit;font-weight:650;padding:.45rem .8rem;cursor:pointer;white-space:nowrap;margin:0;min-height:0;border-radius:0}.ur-tab[aria-selected=true]{color:var(--ink,#1a1f2b);border-bottom-color:var(--ink,#1a1f2b)}
.ur-state{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}.ur-pill{font-size:.75rem;font-weight:700;padding:.15rem .6rem;border-radius:999px}.ur-pill.on{background:var(--good-s,#e3f4ec);color:var(--good,#13875a)}.ur-pill.collect{background:var(--warn-s,#fbf0de);color:var(--warn,#b86e00)}
.ur-chartbox{overflow-x:auto}.ur svg{display:block;width:100%;height:auto;min-width:520px}.ur svg text{fill:var(--muted,#5f6779);font:11px system-ui,sans-serif}
.ur-bar{fill:var(--wire,#a9b6d3)}.ur-bar.tail{fill:var(--bad,#cd2f3c)}.ur-bar.muted{fill:var(--wire,#a9b6d3)}.ur-axis{stroke:var(--line,#dde2ec)}.ur-limit{stroke:var(--bad,#cd2f3c);stroke-width:2}.ur-fixed{stroke:#7a4fd6;stroke-width:2;stroke-dasharray:5 4}.ur-fixedband{fill:#7a4fd6;opacity:.12}.ur-mean{stroke:var(--ink,#1a1f2b);stroke-width:1.5}.ur-sd{stroke:var(--muted,#5f6779)}
.ur svg .ur-lab{fill:var(--ink,#1a1f2b);font-weight:700}.ur svg .ur-lablimit{fill:var(--bad,#cd2f3c);font-weight:700}.ur svg .ur-labfixed{fill:#7a4fd6;font-weight:700}.ur-line{stroke:var(--bad,#cd2f3c);stroke-width:2}.ur-line.dotted{stroke-dasharray:3 4;opacity:.55}.ur-dotpoint{fill:var(--bad,#cd2f3c)}
.ur-sliders{display:grid;grid-template-columns:1fr 1fr;gap:1rem}@media(max-width:600px){.ur-sliders{grid-template-columns:1fr}}
.ur-slider{display:grid;gap:.35rem;background:var(--sunk,#eef1f6);border-radius:10px;padding:.7rem}.ur-slider.off{opacity:.55}.ur-slidertop{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem}.ur-slidertop label{margin:0}.ur-slider input{width:100%;margin:0;accent-color:var(--bad,#cd2f3c)}
.ur-ticks{display:flex;justify-content:space-between;font-size:.7rem;color:var(--muted,#5f6779);font-variant-numeric:tabular-nums}
.ur-big{font-size:1.4rem;font-weight:700;font-variant-numeric:tabular-nums}.ur-big.small{font-size:1.05rem}
.ur-impact{width:100%;border-collapse:collapse;font-size:.85rem;font-variant-numeric:tabular-nums}.ur-impact th,.ur-impact td{text-align:left;padding:.3rem .2rem;border-bottom:1px solid var(--line,#dde2ec)}.ur-impact .n{text-align:right}
.ur-preview{border:1px solid var(--line,#dde2ec);border-radius:12px;padding:.8rem;background:var(--sunk,#eef1f6);display:grid;gap:.4rem}.ur-q{font-weight:700}
.ur-foot{display:flex;justify-content:space-between;align-items:center;gap:.8rem;flex-wrap:wrap}
.ur-min{margin:.6rem 0}.ur-actions{margin:.4rem 0}.ur-now{display:block}
/* With scripting the sliders and charts are the controls; the selects keep the values the form posts and stay out of sight. */
.ur-js ~ form .ur-selects{display:none}.ur-js ~ form .ur-reset{display:inline-block}.ur:not(.ur-js){display:none}`
