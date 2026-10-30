import { ControlPlaneClientError, type IndicatorsUpdate, type IndicatorsView } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"

/**
 * The unit indicators page (10.0.0): what counts as hypotension in each age
 * band, the other thresholds, and whether colleagues are named. Every user in
 * the department sees the indicators; with names off each sees their own row
 * named and colleagues as letters. One form, behind the password.
 */

export const INDICATORS_PATH = "/status/control/indicators"
const ANCHOR = "ward-indicators"

function numberField(body: Record<string, unknown>, name: string, min: number, max: number, integer = false): number {
  const raw = typeof body[name] === "string" ? (body[name] as string).trim().replace(",", ".") : ""
  const value = Number(raw)
  if (raw === "" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new ControlPlaneClientError("INDICATOR_THRESHOLD_INVALID")
  }
  return value
}

/** A band's threshold, or none. MAP 10-150 and systolic 20-200 mmHg: the ranges Core accepts. */
function optionalNumber(body: Record<string, unknown>, name: string, min: number, max: number): number | null {
  const raw = typeof body[name] === "string" ? (body[name] as string).trim().replace(",", ".") : ""
  if (raw === "") return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) throw new ControlPlaneClientError("INDICATOR_THRESHOLD_INVALID")
  return value
}

/** The form's settings. A band with neither threshold counts no hypotension, which is allowed. */
export function indicatorsUpdateFromForm(view: IndicatorsView, body: Record<string, unknown>, reason: string): IndicatorsUpdate {
  return {
    hypotensionBands: view.config.hypotensionBands.map(band => ({
      key: band.key,
      mapBelow: optionalNumber(body, `map_${band.key}`, 10, 150),
      sbpBelow: optionalNumber(body, `sbp_${band.key}`, 20, 200),
    })),
    spo2Below: numberField(body, "spo2Below", 50, 100),
    tempBelow: numberField(body, "tempBelow", 30, 38),
    painAbove: numberField(body, "painAbove", 0, 9, true),
    paedAtLeast: numberField(body, "paedAtLeast", 1, 20, true),
    namedClinicians: body.namedClinicians === "true",
    reason,
  }
}

const value = (number: number | null) => number == null ? "" : String(number)

/** Hospital control · Unit indicators. */
export function renderIndicatorsPage(view: IndicatorsView | null | undefined, locale: StatusLocale): string {
  const title = ""
  const intro = `<p>${localize(locale,
    "Aggregate figures over the department's cases — activity, times, case mix, airway, drugs, the gas footprint, fluids, intraoperative events, recovery and documentation — open to every user in the department. No figure is shown for fewer than five cases. They are worked out from the live record and never exported.",
    "Обобщени данни за случаите на отделението — дейност, времена, профил на случаите, дихателни пътища, медикаменти, въглероден отпечатък на газовете, течности, интраоперативни събития, възстановяване и документация — достъпни за всеки потребител в отделението. Не се показват данни за по-малко от пет случая. Изчисляват се от текущите записи и никога не се изнасят.")}</p>`
  if (!view) {
    return `<div class="component" id="${ANCHOR}">${title}${intro}<div class="empty">${localize(locale, "This API does not offer the unit indicators yet.", "Този API още не предлага индикаторите на отделението.")}</div></div>`
  }
  const { config, defaults } = view
  const label = (entry: { labelEn: string; labelBg: string }) => escapeHtml(locale === "bg" ? entry.labelBg : entry.labelEn)
  const bands = config.hypotensionBands.map(band => {
    const bundled = defaults.hypotensionBands.find(item => item.key === band.key)
    const hint = bundled ? `${localize(locale, "bundled", "вградено")}: ${bundled.mapBelow != null ? `${localize(locale, "MAP", "САН")} &lt; ${bundled.mapBelow}` : ""}${bundled.mapBelow != null && bundled.sbpBelow != null ? " · " : ""}${bundled.sbpBelow != null ? `${localize(locale, "SBP", "САН")} &lt; ${bundled.sbpBelow}` : ""}` : ""
    return `<tr data-band="${escapeHtml(band.key)}"><th scope="row">${label(band)}<span class="component-detail">${hint}</span></th><td><input class="ind-number" name="map_${escapeHtml(band.key)}" inputmode="decimal" value="${value(band.mapBelow)}" aria-label="${localize(locale, "MAP below", "САН под")} — ${label(band)}"></td><td><input class="ind-number" name="sbp_${escapeHtml(band.key)}" inputmode="decimal" value="${value(band.sbpBelow)}" aria-label="${localize(locale, "Systolic below", "Систолно под")} — ${label(band)}"></td></tr>`
  }).join("")
  const single = (name: string, current: number, bundled: number, en: string, bg: string, unit: string) =>
    `<label>${localize(locale, en, bg)}<span class="ind-inline"><input class="ind-number" name="${name}" inputmode="decimal" required value="${current}"> ${unit}</span><span class="component-detail">${localize(locale, "bundled", "вградено")}: ${bundled} ${unit}</span></label>`

  return `<div class="component" id="${ANCHOR}">${title}${intro}<form method="post" action="${INDICATORS_PATH}#${ANCHOR}" data-testid="indicators-form">
<h4>${localize(locale, "Hypotension, by age", "Хипотония според възрастта")}</h4>
<p class="component-detail">${localize(locale,
    "A blood pressure reading is hypotensive below either value set for the patient's age; leave a value empty to not use it. Time in hypotension is counted from the chart's readings, each standing for its 5 minutes and up to 15 until the next. Bundled: children by Pediatric Advanced Life Support (AHA 2020), adults MAP below 65 mmHg.",
    "Измерването е хипотония под която и да е от стойностите за възрастта на пациента; оставете празно, за да не се използва. Времето в хипотония се брои по измерванията в картата — всяко важи за своите 5 минути и до 15 до следващото. Вградено: при деца по Pediatric Advanced Life Support (AHA 2020), при възрастни САН под 65 mmHg.")}</p>
<table class="ind-bands"><thead><tr><th>${localize(locale, "Age band", "Възрастова група")}</th><th>${localize(locale, "MAP below (mmHg)", "САН под (mmHg)")}</th><th>${localize(locale, "Systolic below (mmHg)", "Систолно под (mmHg)")}</th></tr></thead><tbody>${bands}</tbody></table>
<h4>${localize(locale, "Other thresholds", "Други прагове")}</h4>
<div class="form-grid">
${single("spo2Below", config.spo2Below, defaults.spo2Below, "Desaturation: SpO₂ below", "Десатурация: SpO₂ под", "%")}
${single("tempBelow", config.tempBelow, defaults.tempBelow, "Hypothermia: temperature below", "Хипотермия: температура под", "°C")}
${single("painAbove", config.painAbove, defaults.painAbove, "Recovery pain: score above (NRS, FLACC, FPS-R, NIPS)", "Болка при възстановяване: скор над (NRS, FLACC, FPS-R, NIPS)", "")}
${single("paedAtLeast", config.paedAtLeast, defaults.paedAtLeast, "Emergence delirium: PAED at least", "Делир при събуждане: PAED поне", "")}
</div>
<h4>${localize(locale, "Opioid use per anaesthesiologist", "Употреба на опиоиди по анестезиолог")}</h4>
<label class="check"><input type="checkbox" name="namedClinicians" value="true"${config.namedClinicians ? " checked" : ""} data-testid="indicators-named"> ${localize(locale, "Show colleagues by name to the whole department", "Показване на колегите по име на цялото отделение")}</label>
<p class="component-detail">${localize(locale,
    "Off (bundled): each user sees their own row named and colleagues as letters, and can filter by themself only. On: every user sees every colleague's figures by name, and can filter by any of them. This is monitoring of staff; switch it on only with the department's agreement.",
    "Изключено (вградено): всеки потребител вижда своя ред с име, а колегите — с букви, и може да филтрира само по себе си. Включено: всеки вижда данните на всички колеги по име и може да филтрира по всеки от тях. Това е наблюдение на персонала; включвайте го само със съгласието на отделението.")}</p>
<label>${localize(locale, "Reason for the change", "Причина за промяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save the unit indicators settings", "Запазване на настройките на индикаторите")}</button></form></div>`
}

export const INDICATORS_STYLE = `.ind-bands{width:100%;border-collapse:collapse;margin:.6rem 0}.ind-bands th,.ind-bands td{border-bottom:1px solid var(--line);padding:.45rem .5rem;text-align:left;vertical-align:middle}.ind-bands th[scope=row]{font-weight:650}.ind-bands th[scope=row] .component-detail{display:block;font-weight:400}
input.ind-number{width:6.5rem;margin:0;padding:.45rem .6rem}.ind-inline{display:flex;align-items:center;gap:.4rem;margin-top:.3rem;font-weight:400}
@media(max-width:760px){.ind-bands thead{display:none}.ind-bands tr{display:grid;grid-template-columns:1fr 1fr;gap:.3rem;padding:.4rem 0;border-bottom:1px solid var(--line)}.ind-bands th[scope=row]{grid-column:1/-1;border:0;padding:0}.ind-bands td{border:0;padding:0}}`
