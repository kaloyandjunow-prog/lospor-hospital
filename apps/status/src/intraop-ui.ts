import { ControlPlaneClientError, DEFAULT_HYPERTENSION_BASELINE_PERCENT, HYPERTENSION_BASELINE_STEPS, MONITORING_DUE_DEFAULTS, MONITORING_DUE_RANGE, type IntraopAutomationUpdate, type IntraopAutomationView, type StatusSuccessionRow } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"
import { INTRAOP_READINGS_PATH, renderIntraopTabs } from "./readings-ui.js"

/**
 * The SPS page (10.2.0): the master switch, the six
 * groups of questions, suggestions and reminders, the vitals questions with
 * their limits by age band, and the dantrolene vial sizes the hospital stocks.
 * Off in Status is off for everyone; on, each clinician may still turn a group
 * off for themselves. One form, behind the password with a reason.
 */

export const INTRAOP_PATH = "/status/control/intraop"
const ANCHOR = "intraop-automation"

/**
 * The switchable lines: the API's catalogue, plus a switch for each link "Likely now" learned that was never a
 * starting one (its id is not in the catalogue, but a hospital must be able to turn it off).
 */
export function intraopLines(view: IntraopAutomationView): IntraopAutomationView["automations"] {
  const known = new Set(view.automations.map(item => item.id))
  const learned = new Map<string, StatusSuccessionRow>()
  for (const row of view.succession ?? []) if (!known.has(row.id) && !learned.has(row.id)) learned.set(row.id, row)
  return [...view.automations, ...[...learned.values()].map(row => ({
    id: row.id,
    group: "reminders",
    labelEn: `After ${row.from}: ${row.to}`,
    labelBg: `След ${row.fromBg}: ${row.toBg}`,
    detailEn: "Learned from this hospital's finished cases; suggested in Likely now once it is usually due.",
    detailBg: "Научено от завършените случаи на болницата; предлага се в напомнянията „Вероятно сега“, когато обикновено му е времето.",
  }))]
}

const FAMILY_LABELS: Record<string, [string, string]> = {
  general: ["General anaesthesia", "Обща анестезия"],
  neuraxial: ["Neuraxial", "Невраксиална"],
  block: ["Peripheral block", "Периферен блок"],
  sedation: ["Sedation", "Седация"],
  local: ["Local", "Локална"],
  other: ["Other", "Друга"],
}

/** The read-only table: what "Likely now" works from, per technique family. */
export function renderSuccessionTable(rows: readonly StatusSuccessionRow[] | null | undefined, locale: StatusLocale): string {
  const heading = `<h4>${localize(locale, "What Likely now has learned", "Какво са научили напомнянията „Вероятно сега“")}</h4>`
  if (!rows) return `${heading}<p class="component-detail" data-testid="intraop-succession-missing">${localize(locale, "This API does not report it yet.", "Не е налично в тази версия.")}</p>`
  const minCases = rows[0]?.minCases ?? 30
  const intro = `<p class="component-detail">${localize(locale,
    `Which event usually comes next, per technique family. Each starting event begins with written starting values and switches to what this hospital's finished cases show once it has ${minCases} cases. Counts only: no case or clinician is shown. Switch a link off under Reminders above.`,
    `Кое събитие обикновено следва, по вид анестезия. Започва с вградени стойности и преминава към данните на болницата след ${minCases} случая. Връзка се изключва от „Напомняния“ по-горе.`)}</p>`
  const body = rows.map(row => {
    const [familyEn, familyBg] = FAMILY_LABELS[row.family] ?? [row.family, row.family]
    const family = `${localize(locale, familyEn, familyBg)}${row.child ? localize(locale, " · children", " · деца") : ""}`
    const basis = row.source === "learned"
      ? `<span data-source="learned">${localize(locale, "Learned", "Научено")} · ${row.total} ${localize(locale, "cases", "случая")}</span>`
      : `<span data-source="starting">${localize(locale, "Starting value", "Начална стойност")} · ${Math.min(row.learnedCases, row.minCases)} / ${row.minCases} ${localize(locale, "cases so far", "случая досега")}</span>`
    return `<tr data-testid="intraop-succession-row" data-id="${escapeHtml(row.id)}"><td>${escapeHtml(family)}</td><td>${escapeHtml(locale === "bg" ? row.fromBg : row.from)}</td><td>${escapeHtml(locale === "bg" ? row.toBg : row.to)}</td><td>${Math.round(row.share * 100)} %</td><td>${row.gapMinutes} min</td><td>${basis}</td></tr>`
  }).join("")
  return `${heading}${intro}<table class="intraop-succession" data-testid="intraop-succession"><thead><tr><th>${localize(locale, "Technique", "Вид анестезия")}</th><th>${localize(locale, "After", "След")}</th><th>${localize(locale, "Usually next", "Обикновено следва")}</th><th>${localize(locale, "Share", "Дял")}</th><th>${localize(locale, "Usual gap", "Обичаен интервал")}</th><th>${localize(locale, "Based on", "Въз основа на")}</th></tr></thead><tbody>${body}</tbody></table>`
}

const fail = () => new ControlPlaneClientError("INTRAOP_AUTOMATION_INVALID")

/** The form's settings. Every value is checked against what the API said it offers. */
export function intraopUpdateFromForm(view: IntraopAutomationView, body: Record<string, unknown>, reason: string): IntraopAutomationUpdate {
  const on = (name: string) => body[name] === "true"
  // The cases a band needs and the limits are set on the Unusual readings tab; absent here, they keep what is saved.
  const minCasesRaw = typeof body.minCases === "string" ? body.minCases.trim() : null
  const { min, max } = view.minCasesRange
  const minCases = minCasesRaw === null ? view.config.vitalQuestions.minCases : Number(minCasesRaw)
  if (!Number.isInteger(minCases) || minCases < min || minCases > max) throw fail()

  // Absent (an older form) keeps what is saved; present, it must be one of the offered steps.
  const baselineRaw = typeof body.hypertensionBaselinePercent === "string" ? Number(body.hypertensionBaselinePercent) : null
  if (baselineRaw != null && !(HYPERTENSION_BASELINE_STEPS as readonly number[]).includes(baselineRaw)) throw fail()
  const hypertensionBaselinePercent = baselineRaw ?? view.config.vitalQuestions.hypertensionBaselinePercent ?? DEFAULT_HYPERTENSION_BASELINE_PERCENT

  // Each monitor's reading interval: absent (an older form) keeps what is saved; present, a whole 1-120.
  const monitoringDueMinutes: Record<string, number> = {}
  for (const monitor of MONITORING_DUE_DEFAULTS) {
    const raw = body[`due_${monitor.field}`]
    if (typeof raw !== "string") {
      monitoringDueMinutes[monitor.field] = view.config.monitoringDueMinutes?.[monitor.field] ?? monitor.minutes
      continue
    }
    const minutes = Number(raw.trim())
    if (raw.trim() === "" || !Number.isInteger(minutes) || minutes < MONITORING_DUE_RANGE.min || minutes > MONITORING_DUE_RANGE.max) throw fail()
    monitoringDueMinutes[monitor.field] = minutes
  }

  const vials = view.vialSizesMg.filter(size => on(`vial_${size}`))
  // At least one size is stocked: the dantrolene card plans doses from what is on the shelf.
  if (vials.length === 0) throw fail()

  const tails: IntraopAutomationUpdate["vitalQuestions"]["tails"] = {}
  for (const band of view.bands) {
    tails[band.key] = {}
    for (const sign of view.signs) {
      const saved = view.config.vitalQuestions.tails[band.key]?.[sign.key] ?? { low: view.defaultTail, high: view.defaultTail }
      const read = (end: "low" | "high") => {
        const raw = body[`tail_${band.key}_${sign.key}_${end}`]
        if (raw === undefined) return saved[end]
        const value = Number(typeof raw === "string" ? raw.replace(",", ".") : NaN)
        if (!view.tailSteps.includes(value)) throw fail()
        return value
      }
      tails[band.key][sign.key] = { low: read("low"), high: read("high") }
    }
  }
  return {
    enabled: on("enabled"),
    groups: Object.fromEntries(view.groups.map(group => [group.key, on(`group_${group.key}`)])),
    // A line is on when its box is ticked; the ones left unticked are the switched-off list.
    disabled: intraopLines(view).filter(item => !on(`auto_${item.id}`)).map(item => item.id).sort(),
    dantroleneVialsMg: vials,
    monitoringDueMinutes,
    vitalQuestions: { enabled: on("vitalsEnabled"), minCases, tails, hypertensionBaselinePercent },
    reason,
  }
}

/** Hospital control · SPS. */
export function renderIntraopPage(view: IntraopAutomationView | null | undefined, locale: StatusLocale): string {
  const intro = `<p>${localize(locale,
    "Questions, suggestions and reminders on the intraoperative record. Everything starts on. A group switched off here turns off everything in it; each line can also be switched off on its own. Nothing is recorded without a clinician's tap, and switching a group off never changes what was already charted. Each clinician can also turn a group off for themselves in their own settings; a group that is off here is not offered to them at all.",
    "Въпроси, предложения и напомняния в интраоперативния запис. Всичко е включено по подразбиране. Изключена група изключва всичко в нея; всеки ред може да се изключи и поотделно. Нищо не се записва без потвърждение от лекаря. Всеки лекар може да изключи група и само за себе си.")}</p>`
  if (!view) {
    return `${renderIntraopTabs("switches", locale)}<div class="component" id="${ANCHOR}">${intro}<div class="empty">${localize(locale, "This API does not offer SPS yet.", "Не е налично в тази версия.")}</div></div>`
  }
  const { config } = view
  const label = (entry: { labelEn: string; labelBg: string }) => escapeHtml(locale === "bg" ? entry.labelBg : entry.labelEn)
  const check = (name: string, checked: boolean, text: string, testId?: string) =>
    `<label class="check"><input type="checkbox" name="${name}" value="true"${checked ? " checked" : ""}${testId ? ` data-testid="${testId}"` : ""}> ${text}</label>`

  // How each line was received over the period, beside the switch that can turn a noisy one off.
  const acceptance = view.acceptance
  const received = (id: string) => {
    if (!acceptance) return ""
    const counts = acceptance.byId[id]
    if (!counts || counts.accepted + counts.dismissed === 0) return ` <span class="intraop-stat" data-quiet>${localize(locale, "no answers", "няма отговори")}</span>`
    const answered = counts.accepted + counts.dismissed
    const share = Math.round((counts.accepted / answered) * 100)
    // Ten answers or more with fewer than one in five taken up: worth a look.
    const noisy = answered >= 10 && share < 20
    return ` <span class="intraop-stat"${noisy ? " data-noisy" : ""}>${counts.accepted} ${localize(locale, "taken", "приети")} · ${counts.dismissed} ${localize(locale, "not now", "не сега")} · ${share} %${noisy ? ` — ${localize(locale, "rarely taken up", "рядко се приема")}` : ""}</span>`
  }
  const allLines = intraopLines(view)
  const lines = (key: string) => {
    const items = allLines.filter(item => item.group === key)
    if (items.length === 0) return ""
    const running = items.filter(item => !config.disabled.includes(item.id)).length
    const rows = items.map(item => `<li>${check(`auto_${escapeHtml(item.id)}`, !config.disabled.includes(item.id), `${label(item)}`, `intraop-line-${escapeHtml(item.id)}`)}<span class="component-detail">${escapeHtml(locale === "bg" ? item.detailBg : item.detailEn)}${received(item.id)}</span></li>`).join("")
    return `<details class="intraop-lines"><summary>${localize(locale, "Each one on its own", "Поотделно")} · ${running} / ${items.length} ${localize(locale, "on", "включени")}</summary><ul>${rows}</ul></details>`
  }
  const groups = view.groups.map(group => `<div class="intraop-group">${check(`group_${escapeHtml(group.key)}`, config.groups[group.key] === true, `<strong>${label(group)}</strong>`, `intraop-group-${escapeHtml(group.key)}`)}<span class="component-detail">${escapeHtml(locale === "bg" ? group.detailBg : group.detailEn)}</span>${lines(group.key)}</div>`).join("")

  const vials = view.vialSizesMg.map(size => check(`vial_${size}`, config.dantroleneVialsMg.includes(size), `${size} mg`, `intraop-vial-${size}`)).join("")

  return `${renderIntraopTabs("switches", locale)}<div class="component" id="${ANCHOR}">${intro}<form method="post" action="${INTRAOP_PATH}#${ANCHOR}" data-testid="intraop-form">
<h4>${localize(locale, "Master switch", "SPS")}</h4>
${check("enabled", config.enabled, `<strong>${localize(locale, "Use SPS", "SPS е включена")}</strong>`, "intraop-enabled")}
<p class="component-detail">${localize(locale, "Off: no questions and no suggestions anywhere, whatever is chosen below.", "Изключено: няма въпроси и предложения, независимо от избраното по-долу.")}</p>
<div class="intraop-search"><input type="search" data-testid="intraop-search" autocomplete="off" placeholder="${localize(locale, "Search the lines", "Търсене сред редовете")}" aria-label="${localize(locale, "Search the lines", "Търсене сред редовете")}"><span class="component-detail" data-testid="intraop-search-count" aria-live="polite"></span></div>
<script src="/status/intraop-search.js" defer></script>
<h4>${localize(locale, "Groups", "Групи")}</h4>
${acceptance ? `<p class="component-detail" data-testid="intraop-acceptance">${localize(locale,
    `Beside each line: how often it was taken up and how often put away, over the ${acceptance.days} days before today (${acceptance.cases} cases). A line that is mostly put away may be noise; switch it off here. Reminders and follow-ups only show when put away.`,
    `До всеки ред: колко често е приета и отхвърлена всяка карта през последните ${acceptance.days} дни (${acceptance.cases} случая). Ред, който почти винаги се отхвърля, вероятно е излишен; изключете го.`)}</p>` : ""}
<div class="intraop-groups">${groups}</div>
${renderSuccessionTable(view.succession, locale)}
<h4>${localize(locale, "Questions from the vital signs", "Въпроси от жизнените показатели")}</h4>
${check("vitalsEnabled", config.vitalQuestions.enabled, localize(locale, "Ask about unusual heart rate and blood pressure", "Питане при необичаен пулс и кръвно налягане"), "intraop-vitals")}
<p class="component-detail">${localize(locale,
    "A reading is unusual when it falls in the lowest or highest share of this hospital's own readings for the patient's age band. Until a band has enough cases only the fixed rules ask. Smaller shares ask less often.",
    "Показанието е необичайно, ако е в най-ниския или най-високия дял от показанията в болницата за възрастовата група на пациента. Докато групата няма достатъчно случаи, важат само фиксираните правила.")}</p>
<label>${localize(locale, "Hypertension: SBP or MAP this far above the patient's baseline", "Хипертенсия: систолното АН или САН с толкова над изходното")}<span class="ind-inline"><select name="hypertensionBaselinePercent" data-testid="intraop-hypertension-baseline">${HYPERTENSION_BASELINE_STEPS.map(step => `<option value="${step}"${step === (config.vitalQuestions.hypertensionBaselinePercent ?? DEFAULT_HYPERTENSION_BASELINE_PERCENT) ? " selected" : ""}>${step}%</option>`).join("")}</select></span><span class="component-detail">${localize(locale, "The baseline is the preoperative BP when it was entered, otherwise the first BP charted in theatre. Hypertension is judged on this alone; hypotension keeps its fixed age rule and the statistics below.", "Изходно е предоперативното АН, а ако липсва, първото АН в операционната. Хипотенсията следва фиксираното правило по възраст и статистиката.")}</span></label>
<p class="component-detail" data-testid="intraop-readings-link">${localize(locale, "How unusual a reading must be, per age band and sign, and how many cases a band needs, are set on the", "Границите по възрастови групи се задават в")} <a href="${INTRAOP_READINGS_PATH}">${localize(locale, "Unusual readings", "Необичайни показания")}</a> ${localize(locale, "tab.", ".")}</p>
<h4>${localize(locale, "Monitor readings due", "Напомняне за ново отчитане от монитора")}</h4>
<p class="component-detail">${localize(locale, "Minutes after a monitor's last reading before the Monitoring screen marks the next one as due. 1 to 120 minutes.", "След колко минути без отчитане екранът напомня за ново (1–120 мин).")}</p>
<div class="intraop-due">${MONITORING_DUE_DEFAULTS.map(monitor => `<label>${localize(locale, monitor.labelEn, monitor.labelBg)}<span class="ind-inline"><input class="ind-number" name="due_${monitor.field}" inputmode="numeric" required value="${config.monitoringDueMinutes?.[monitor.field] ?? monitor.minutes}" data-testid="intraop-due-${monitor.field}"> min</span><span class="component-detail">${localize(locale, "bundled", "по подразбиране")}: ${monitor.minutes}</span></label>`).join("")}</div>
<h4>${localize(locale, "Dantrolene vials in stock", "Флакони дантролен в наличност")}</h4>
<div class="intraop-vials">${vials}</div>
<p class="component-detail">${localize(locale,
    "The malignant hyperthermia card draws the vials to open. It plans each dose on its own from the sizes ticked here, using the fewest vials so that nothing is opened that is not needed. At least one size is required.",
    "Картата за малигнена хипертермия изчислява кои флакони да се отворят, с възможно най-малко флакони. Отбележете поне един наличен размер.")}</p>
<label>${localize(locale, "Reason for the change", "Причина за промяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save SPS settings", "Запазване")}</button></form></div>`
}

export const INTRAOP_STYLE = `.intraop-groups{display:grid;gap:.5rem;margin:.4rem 0}.intraop-group{display:grid;gap:.15rem}.intraop-group .component-detail{margin-left:1.7rem}
.intraop-lines{margin:.3rem 0 0 1.7rem}.intraop-lines summary{cursor:pointer;color:var(--muted)}.intraop-lines ul{list-style:none;margin:.4rem 0 0;padding:0;display:grid;gap:.45rem}.intraop-lines li{display:grid;gap:.1rem}.intraop-lines li .component-detail{margin-left:1.7rem}.intraop-lines[hidden],.intraop-lines li[hidden]{display:none}.intraop-search{display:flex;align-items:center;gap:.6rem;margin:.6rem 0}.intraop-search input{flex:1;max-width:26rem}.intraop-search [data-empty="1"]{color:var(--danger,#b42318)}
.intraop-stat{display:inline-block;margin-left:.4rem;font-variant-numeric:tabular-nums}.intraop-stat[data-quiet]{opacity:.7}.intraop-stat[data-noisy]{color:var(--warn);font-weight:650}
.intraop-vials{display:flex;flex-wrap:wrap;gap:1rem;margin:.4rem 0}
.intraop-succession td:nth-child(4),.intraop-succession td:nth-child(5){font-variant-numeric:tabular-nums;text-align:right}.intraop-succession [data-source=starting]{color:var(--muted)}
@media(max-width:760px){.intraop-succession thead{display:none}.intraop-succession tr{display:grid;grid-template-columns:1fr 1fr;gap:.2rem .6rem;padding:.4rem 0}.intraop-succession td{border:0;padding:0;text-align:left!important}}
.intraop-tails th,.intraop-tails td{text-align:center}.intraop-tails th:first-child,.intraop-tails th[scope=row]{text-align:left}.intraop-tails th .component-detail{display:block;font-weight:400}
.intraop-pair{display:inline-flex;gap:.3rem}.intraop-pair select{width:auto;margin:0;padding:.35rem .4rem}
@media(max-width:760px){.intraop-tails thead{display:none}.intraop-tails tr{display:flex;flex-wrap:wrap;gap:.4rem;padding:.4rem 0}.intraop-tails th[scope=row]{flex:1 0 100%;border:0;padding:0}.intraop-tails td{border:0;padding:0}}`
