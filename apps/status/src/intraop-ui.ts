import { ControlPlaneClientError, type IntraopAutomationUpdate, type IntraopAutomationView } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"

/**
 * The intraoperative suggestions page (10.2.0): the master switch, the six
 * groups of questions, suggestions and reminders, the vitals questions with
 * their limits by age band, and the dantrolene vial sizes the hospital stocks.
 * Off in Status is off for everyone; on, each clinician may still turn a group
 * off for themselves. One form, behind the password with a reason.
 */

export const INTRAOP_PATH = "/status/control/intraop"
const ANCHOR = "intraop-automation"

const fail = () => new ControlPlaneClientError("INTRAOP_AUTOMATION_INVALID")

/** The form's settings. Every value is checked against what the API said it offers. */
export function intraopUpdateFromForm(view: IntraopAutomationView, body: Record<string, unknown>, reason: string): IntraopAutomationUpdate {
  const on = (name: string) => body[name] === "true"
  const minCasesRaw = typeof body.minCases === "string" ? body.minCases.trim() : ""
  const minCases = Number(minCasesRaw)
  const { min, max } = view.minCasesRange
  if (minCasesRaw === "" || !Number.isInteger(minCases) || minCases < min || minCases > max) throw fail()

  const vials = view.vialSizesMg.filter(size => on(`vial_${size}`))
  // At least one size is stocked: the dantrolene card plans doses from what is on the shelf.
  if (vials.length === 0) throw fail()

  const tails: IntraopAutomationUpdate["vitalQuestions"]["tails"] = {}
  for (const band of view.bands) {
    tails[band.key] = {}
    for (const sign of view.signs) {
      const read = (end: "low" | "high") => {
        const value = Number(typeof body[`tail_${band.key}_${sign.key}_${end}`] === "string" ? (body[`tail_${band.key}_${sign.key}_${end}`] as string).replace(",", ".") : NaN)
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
    disabled: view.automations.filter(item => !on(`auto_${item.id}`)).map(item => item.id).sort(),
    dantroleneVialsMg: vials,
    vitalQuestions: { enabled: on("vitalsEnabled"), minCases, tails },
    reason,
  }
}

const percent = (value: number) => `${String(value).replace(".", ",")} %`

/** Hospital control · Intraoperative suggestions. */
export function renderIntraopPage(view: IntraopAutomationView | null | undefined, locale: StatusLocale): string {
  const intro = `<p>${localize(locale,
    "Questions, suggestions and reminders on the intraoperative record. Everything starts off. Switching a group on turns on everything in it; each line can then be switched off on its own. Nothing is recorded without a clinician's tap, and switching a group off never changes what was already charted. Each clinician can also turn a group off for themselves in their own settings; a group that is off here is not offered to them at all.",
    "Въпроси, предложения и напомняния в интраоперативния запис. Всичко започва изключено. Включването на група включва всичко в нея; всеки ред може после да се изключи поотделно. Нищо не се записва без докосване от лекаря, а изключването на група никога не променя вече записаното. Всеки лекар може да изключи група и за себе си в своите настройки; група, изключена тук, не се предлага изобщо.")}</p>`
  if (!view) {
    return `<div class="component" id="${ANCHOR}">${intro}<div class="empty">${localize(locale, "This API does not offer the intraoperative suggestions yet.", "Този API още не предлага интраоперативните предложения.")}</div></div>`
  }
  const { config } = view
  const label = (entry: { labelEn: string; labelBg: string }) => escapeHtml(locale === "bg" ? entry.labelBg : entry.labelEn)
  const check = (name: string, checked: boolean, text: string, testId?: string) =>
    `<label class="check"><input type="checkbox" name="${name}" value="true"${checked ? " checked" : ""}${testId ? ` data-testid="${testId}"` : ""}> ${text}</label>`

  const lines = (key: string) => {
    const items = view.automations.filter(item => item.group === key)
    if (items.length === 0) return ""
    const running = items.filter(item => !config.disabled.includes(item.id)).length
    const rows = items.map(item => `<li>${check(`auto_${escapeHtml(item.id)}`, !config.disabled.includes(item.id), `${label(item)}`, `intraop-line-${escapeHtml(item.id)}`)}<span class="component-detail">${escapeHtml(locale === "bg" ? item.detailBg : item.detailEn)}</span></li>`).join("")
    return `<details class="intraop-lines"><summary>${localize(locale, "Each one on its own", "Всяка поотделно")} · ${running} / ${items.length} ${localize(locale, "on", "включени")}</summary><ul>${rows}</ul></details>`
  }
  const groups = view.groups.map(group => `<div class="intraop-group">${check(`group_${escapeHtml(group.key)}`, config.groups[group.key] === true, `<strong>${label(group)}</strong>`, `intraop-group-${escapeHtml(group.key)}`)}<span class="component-detail">${escapeHtml(locale === "bg" ? group.detailBg : group.detailEn)}</span>${lines(group.key)}</div>`).join("")

  const tailOptions = (selected: number) => view.tailSteps.map(step => `<option value="${step}"${step === selected ? " selected" : ""}>${percent(step)}</option>`).join("")
  const bandRows = view.bands.map(band => {
    const cells = view.signs.map(sign => {
      const pair = config.vitalQuestions.tails[band.key]?.[sign.key] ?? { low: view.defaultTail, high: view.defaultTail }
      const name = `tail_${escapeHtml(band.key)}_${escapeHtml(sign.key)}`
      return `<td><span class="intraop-pair"><select name="${name}_low" aria-label="${label(sign)}, ${localize(locale, "low end", "ниският край")} — ${label(band)}">${tailOptions(pair.low)}</select><select name="${name}_high" aria-label="${label(sign)}, ${localize(locale, "high end", "високият край")} — ${label(band)}">${tailOptions(pair.high)}</select></span></td>`
    }).join("")
    return `<tr data-band="${escapeHtml(band.key)}"><th scope="row">${label(band)}</th>${cells}</tr>`
  }).join("")
  const signHeads = view.signs.map(sign => `<th>${label(sign)}<span class="component-detail">${localize(locale, "low · high", "ниско · високо")}</span></th>`).join("")

  const vials = view.vialSizesMg.map(size => check(`vial_${size}`, config.dantroleneVialsMg.includes(size), `${size} mg`, `intraop-vial-${size}`)).join("")

  return `<div class="component" id="${ANCHOR}">${intro}<form method="post" action="${INTRAOP_PATH}#${ANCHOR}" data-testid="intraop-form">
<h4>${localize(locale, "Master switch", "Главен превключвател")}</h4>
${check("enabled", config.enabled, `<strong>${localize(locale, "Use intraoperative suggestions", "Използване на интраоперативни предложения")}</strong>`, "intraop-enabled")}
<p class="component-detail">${localize(locale, "Off: no questions and no suggestions anywhere, whatever is chosen below.", "Изключено: никакви въпроси и предложения никъде, каквото и да е избрано по-долу.")}</p>
<h4>${localize(locale, "Groups", "Групи")}</h4>
<div class="intraop-groups">${groups}</div>
<h4>${localize(locale, "Questions from the vital signs", "Въпроси от жизнените показатели")}</h4>
${check("vitalsEnabled", config.vitalQuestions.enabled, localize(locale, "Ask about unusual heart rate and blood pressure", "Питане при необичаен пулс и кръвно налягане"), "intraop-vitals")}
<p class="component-detail">${localize(locale,
    "A reading is unusual when it falls in the lowest or highest share of this hospital's own readings for the patient's age band. Until a band has enough cases only the fixed rules ask. Smaller shares ask less often.",
    "Показанието е необичайно, когато попада в най-ниския или най-високия дял от показанията на самата болница за възрастовата група на пациента. Докато групата няма достатъчно случаи, питат само фиксираните правила. По-малките дялове питат по-рядко.")}</p>
<label>${localize(locale, "Cases a band needs before its statistics are used", "Случаи, нужни на група, преди да се ползва нейната статистика")}<span class="ind-inline"><input class="ind-number" name="minCases" inputmode="numeric" required value="${config.vitalQuestions.minCases}"></span><span class="component-detail">${localize(locale, "bundled", "вградено")}: ${view.defaultMinCases} · ${view.minCasesRange.min}–${view.minCasesRange.max}</span></label>
<table class="ind-bands intraop-tails"><thead><tr><th>${localize(locale, "Age band", "Възрастова група")}</th>${signHeads}</tr></thead><tbody>${bandRows}</tbody></table>
<h4>${localize(locale, "Dantrolene vials in stock", "Флакони дантролен в наличност")}</h4>
<div class="intraop-vials">${vials}</div>
<p class="component-detail">${localize(locale,
    "The malignant hyperthermia card draws the vials to open. It plans each dose on its own from the sizes ticked here, using the fewest vials so that nothing is opened that is not needed. At least one size is required.",
    "Картата за малигнена хипертермия чертае флаконите, които трябва да се отворят. Тя планира всяка доза отделно от размерите, отбелязани тук, с най-малък брой флакони, така че да не се отваря ненужен флакон. Нужен е поне един размер.")}</p>
<label>${localize(locale, "Reason for the change", "Причина за промяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save the intraoperative suggestions settings", "Запазване на настройките на интраоперативните предложения")}</button></form></div>`
}

export const INTRAOP_STYLE = `.intraop-groups{display:grid;gap:.5rem;margin:.4rem 0}.intraop-group{display:grid;gap:.15rem}.intraop-group .component-detail{margin-left:1.7rem}
.intraop-lines{margin:.3rem 0 0 1.7rem}.intraop-lines summary{cursor:pointer;color:var(--muted)}.intraop-lines ul{list-style:none;margin:.4rem 0 0;padding:0;display:grid;gap:.45rem}.intraop-lines li{display:grid;gap:.1rem}.intraop-lines li .component-detail{margin-left:1.7rem}
.intraop-vials{display:flex;flex-wrap:wrap;gap:1rem;margin:.4rem 0}
.intraop-tails th,.intraop-tails td{text-align:center}.intraop-tails th:first-child,.intraop-tails th[scope=row]{text-align:left}.intraop-tails th .component-detail{display:block;font-weight:400}
.intraop-pair{display:inline-flex;gap:.3rem}.intraop-pair select{width:auto;margin:0;padding:.35rem .4rem}
@media(max-width:760px){.intraop-tails thead{display:none}.intraop-tails tr{display:flex;flex-wrap:wrap;gap:.4rem;padding:.4rem 0}.intraop-tails th[scope=row]{flex:1 0 100%;border:0;padding:0}.intraop-tails td{border:0;padding:0}}`
