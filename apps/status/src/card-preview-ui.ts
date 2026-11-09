import type { CardPreviewRow, CardPreviewView, IntraopAutomationView } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { renderIntraopTabs } from "./readings-ui.js"
import { escapeHtml } from "./util.js"

/**
 * The Card preview tab of the SPS page (10.3.0): a treatment card as a clinician sees it after a complication, for a
 * sample patient, so a hospital can look at a card before deciding whether to keep it on. Plain GET form, no script.
 * Nothing here is a case: the patient is a stand-in and nothing is charted.
 */

export const INTRAOP_CARDS_PATH = "/status/control/intraop/cards"

export type CardQuery = { complication: string; patient: string }

/** The query of a request: a complication name of reasonable length, and a patient key that is a plain word. */
export function cardQueryOf(get: (name: string) => string | undefined): CardQuery {
  const complication = (get("complication") ?? "").trim().slice(0, 120)
  const patient = /^[a-z]{1,12}$/.test(get("patient") ?? "") ? get("patient")! : "adult"
  return { complication, patient }
}

const KIND_NAMES: Record<string, [string, string]> = {
  drug: ["Drug", "Лекарство"],
  infusion: ["Infusion", "Инфузия"],
  fluid: ["Fluid", "Течност"],
  stop: ["Stop", "Спиране"],
  gas: ["Gas settings", "Настройки на газовете"],
  relabel: ["Change the label", "Смяна на означението"],
  alsoLog: ["Also log", "Запиши и"],
  openCard: ["Open another card", "Отваряне на друга карта"],
  event: ["Chart an event", "Запис на събитие"],
  shock: ["Shock", "Шок"],
  lab: ["Order a test", "Изследване"],
  question: ["Question", "Въпрос"],
  resolve: ["Mark resolved", "Отбелязване като разрешено"],
  note: ["Note", "Бележка"],
  access: ["Access", "Достъп"],
  airway: ["Airway", "Дихателен път"],
  deepen: ["Deepen anaesthesia", "Задълбочаване на анестезията"],
  memory: ["Reminder list", "Списък за напомняне"],
}

export function renderCardPreviewPage(
  view: CardPreviewView | null | undefined,
  automations: IntraopAutomationView | null | undefined,
  query: CardQuery,
  locale: StatusLocale,
): string {
  const intro = `<p>${localize(locale,
    "What a treatment card shows a clinician after a complication, for a sample patient: the questions, the rows, and the doses worked out on the patient's age and weight. Nothing is charted from here and no case is read. Whether the card is on for this hospital is set on the Switches tab.",
    "Какво показва картата за лечение на лекаря след усложнение, за примерен пациент: въпросите, редовете и дозите, изчислени по възрастта и теглото. Оттук нищо не се записва и не се чете случай. Дали картата е включена за болницата, се задава в раздела „Превключватели“.")}</p>`
  if (!view || !automations) {
    return `${renderIntraopTabs("cards", locale)}<div class="component" id="intraop-cards">${intro}<div class="empty">${localize(locale, "This API does not offer the card preview yet.", "Този API още не предлага прегледа на картите.")}</div></div>`
  }
  const cards = automations.automations.filter(item => item.group === "treatmentSuggestions" && item.id.startsWith("card:"))
  const patientOptions = view.patients.map(patient => `<option value="${escapeHtml(patient.key)}"${patient.key === query.patient ? " selected" : ""}>${escapeHtml(locale === "bg" ? patient.labelBg : patient.labelEn)}</option>`).join("")
  const cardOptions = [`<option value="">${localize(locale, "Choose a card", "Изберете карта")}</option>`,
    ...cards.map(item => {
      const name = item.id.slice("card:".length)
      return `<option value="${escapeHtml(name)}"${name === query.complication ? " selected" : ""}>${escapeHtml(locale === "bg" ? item.labelBg : item.labelEn)}</option>`
    })].join("")
  const form = `<form method="get" action="${INTRAOP_CARDS_PATH}" class="card-preview-form" data-testid="card-preview-form"><label>${localize(locale, "Card", "Карта")}<select name="complication">${cardOptions}</select></label><label>${localize(locale, "Sample patient", "Примерен пациент")}<select name="patient">${patientOptions}</select></label><button type="submit">${localize(locale, "Show", "Покажи")}</button></form>`

  const card = view.preview
  let body = `<div class="empty" data-testid="card-preview-none">${localize(locale, "Choose a card to see it.", "Изберете карта, за да я видите.")}</div>`
  if (query.complication && !card) {
    body = `<div class="empty" data-testid="card-preview-missing">${localize(locale, "That card has no preview.", "За тази карта няма преглед.")}</div>`
  } else if (card) {
    const off = automations.config.disabled.includes(`card:${card.complication}`)
    const status = off
      ? `<span class="card-preview-off" data-testid="card-preview-off">${localize(locale, "Switched off for this hospital", "Изключена за болницата")}</span>`
      : `<span class="card-preview-on">${localize(locale, "On for this hospital", "Включена за болницата")}</span>`
    const row = (item: CardPreviewRow) => {
      const kind = KIND_NAMES[item.kind]
      const dose = item.dose ? `<b class="card-preview-dose">${escapeHtml(locale === "bg" ? item.dose.bg : item.dose.en)}</b>` : ""
      const note = (locale === "bg" ? item.noteBg : item.noteEn)
      const step = item.step ? `<span class="component-detail">${localize(locale, "step", "стъпка")} ${item.step.index + 1} / ${item.step.of}</span>` : ""
      const total = item.total ? `<span class="component-detail">${localize(locale, "total", "общо")} ${item.total.amount} / ${item.total.max} ${escapeHtml(item.total.unit)}</span>` : ""
      const branches = item.branches ? `<span class="component-detail">${escapeHtml(item.branches.join(" / "))}</span>` : ""
      return `<li data-testid="card-preview-row" data-kind="${escapeHtml(item.kind)}"><span class="card-preview-kind">${escapeHtml(kind ? localize(locale, kind[0], kind[1]) : item.kind)}</span><span class="card-preview-title">${escapeHtml(locale === "bg" ? item.titleBg : item.titleEn)}</span>${dose}${step}${total}${branches}${note ? `<span class="component-detail">${escapeHtml(note)}</span>` : ""}</li>`
    }
    const question = card.question ? `<p class="card-preview-question">${escapeHtml(locale === "bg" ? card.question.bg : card.question.en)}</p>` : ""
    const branches = card.branches ? `<p class="card-preview-branches">${card.branches.prompt ? `${escapeHtml(locale === "bg" ? card.branches.prompt.bg : card.branches.prompt.en)} ` : ""}${card.branches.options.map(option => `<span class="intraop-stat">${escapeHtml(locale === "bg" ? option.title.bg : option.title.en)}</span>`).join(" ")}</p>` : ""
    body = `<div class="card-preview" data-testid="card-preview" data-kind="${escapeHtml(card.kind)}"${card.redStrip ? " data-urgent" : ""}>
<header><strong>${escapeHtml(locale === "bg" ? card.complicationBg : card.complication)}</strong> ${status}<span class="component-detail">${card.kind === "checklist" ? localize(locale, "Checklist", "Списък със стъпки") : localize(locale, "Treatment card", "Карта за лечение")} · ${escapeHtml(locale === "bg" ? card.patient.labelBg : card.patient.labelEn)}</span>${card.redStrip ? `<span class="card-preview-strip">${localize(locale, "Time-critical: a red strip shows the time since onset", "Времево критично: червена лента показва времето от началото")}</span>` : ""}</header>
${question}${branches}<ul class="card-preview-rows">${card.rows.map(row).join("")}</ul></div>
<p class="component-detail">${localize(locale, "Each row opens the usual sheet with this prefilled; the clinician saves or closes it. A dose from the drug's own suggestion is worked out by the sheet.", "Всеки ред отваря обичайния лист с това попълнено; лекарят го записва или затваря. Доза по предложението за лекарството се изчислява от самия лист.")}</p>`
  }
  return `${renderIntraopTabs("cards", locale)}<div class="component" id="intraop-cards">${intro}${form}${body}</div>`
}

export const CARD_PREVIEW_STYLE = `.card-preview-form{display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end;margin:.6rem 0}.card-preview-form label{display:grid;gap:.2rem}.card-preview{border:1px solid var(--line,#e2e8f0);border-radius:10px;padding:.7rem .9rem;margin:.6rem 0;max-width:34rem}.card-preview[data-urgent]{border-color:var(--danger,#b42318)}.card-preview header{display:grid;gap:.2rem;margin-bottom:.4rem}.card-preview-strip{color:var(--danger,#b42318);font-size:.8rem;font-weight:700}.card-preview-on{color:var(--ok,#067647);font-size:.85rem}.card-preview-off{color:var(--danger,#b42318);font-size:.85rem;font-weight:700}.card-preview-question{font-weight:700;margin:.3rem 0}.card-preview-rows{list-style:none;margin:.3rem 0 0;padding:0;display:grid;gap:.45rem}.card-preview-rows li{display:flex;flex-wrap:wrap;gap:.2rem .6rem;align-items:baseline;border-top:1px solid var(--line,#e2e8f0);padding-top:.4rem}.card-preview-kind{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#64748b);min-width:7rem}.card-preview-title{font-weight:600}.card-preview-dose{font-variant-numeric:tabular-nums}`
