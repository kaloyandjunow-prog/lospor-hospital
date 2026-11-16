import type { PreopFixedSectionView, PreopOrderOptionView, PreopPopulation, PreopSectionConfigView, PreopSectionsView, PreopVitalsSettingsView } from "./control-plane.js"
import { formSectionKeys } from "./preop-sections-form.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"

/**
 * The Status pages for the form configuration (1.7.0): which preoperative and
 * postoperative sections are on, the ward-order and medication-instruction
 * lists, and the specialties a consultation can name. One editor per
 * population, adults and children, switched as the questions are. Plain HTML
 * forms that work without JavaScript, like the rest of Status.
 */

type Population = { id: PreopPopulation; en: string; bg: string }
const POPULATIONS: Population[] = [
  { id: "ADULT", en: "Adults", bg: "Възрастни" },
  { id: "PEDIATRIC", en: "Children", bg: "Деца" },
]

const label = (entry: { labelEn: string; labelBg: string }, locale: StatusLocale) => escapeHtml(locale === "bg" ? entry.labelBg : entry.labelEn)

function confirm(locale: StatusLocale): string {
  return `<label>${localize(locale, "Reason for the change", "Причина за промяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>`
}

/** Adults and children, one shown at a time: the switch links to each editor's anchor. */
function byPopulation(prefix: string, locale: StatusLocale, editor: (population: Population, anchor: string) => string): string {
  const anchor = (population: Population) => `${prefix}-${population.id === "ADULT" ? "adults" : "children"}`
  const switcher = `<nav class="preop-switch" aria-label="${localize(locale, "Profile", "Профил")}">${POPULATIONS.map(population => `<a href="#${anchor(population)}" data-population="${population.id}">${localize(locale, population.en, population.bg)}</a>`).join("")}</nav>`
  return `${switcher}${POPULATIONS.map(population => `<section class="preop-population" id="${anchor(population)}" data-pop="${population.id}"${population.id === "ADULT" ? " data-default" : ""}>${editor(population, anchor(population))}</section>`).join("")}`
}

function fixedList(fixed: PreopFixedSectionView[], locale: StatusLocale): string {
  return `<ul class="component-detail" data-testid="fixed-sections">${fixed.map(section => `<li><strong>${label(section, locale)}</strong> · ${escapeHtml(locale === "bg" ? section.reasonBg : section.reasonEn)}</li>`).join("")}</ul>`
}

function sectionSwitches(sections: PreopSectionsView, population: Population, anchor: string, form: "PREOP" | "POSTOP", locale: StatusLocale): string {
  const config = sections.configs[population.id]
  if (!config) return `<p class="component-detail">${localize(locale, "This profile has not been provisioned yet.", "Този профил още не е създаден.")}</p>`
  const keys = new Set(formSectionKeys(sections, population.id, form))
  const byKey = new Map(sections.definitions.map(definition => [definition.key, definition]))
  const rows = sections.definitions.filter(definition => keys.has(definition.key)).map(definition => {
    const needs = definition.requires ? byKey.get(definition.requires) : undefined
    const needsNote = needs ? ` <span class="component-detail">(${localize(locale, "needs", "изисква")} ${label(needs, locale)})</span>` : ""
    return `<label class="check"><input type="checkbox" name="section_${escapeHtml(definition.key)}" value="true" ${config.sections[definition.key] !== false ? "checked" : ""} data-testid="section-${escapeHtml(definition.key)}-${population.id}"> ${label(definition, locale)}${needsNote}</label>`
  }).join("")
  const part = form === "POSTOP" ? "postop" : "sections"
  const extra = form === "PREOP" ? `${vitalsSwitches(sections, config, population, locale)}${medicationsSwitch(sections, config, population, locale)}` : ""
  return `<form method="post" action="/status/control/preop-sections#${anchor}"><input type="hidden" name="part" value="${part}"><input type="hidden" name="population" value="${population.id}"><div class="checks">${rows}</div>${extra}${confirm(locale)}<button type="submit">${localize(locale, "Save the sections for", "Запазване за")} ${localize(locale, population.en, population.bg).toLowerCase()}</button></form>`
}

/**
 * Which preoperative vitals hold up the case (1.11.0). The vitals are always
 * shown; these say which must be filled in -- or marked unobtainable -- before
 * the case can continue and be finalised.
 */
function vitalsSwitches(sections: PreopSectionsView, config: PreopSectionConfigView, population: Population, locale: StatusLocale): string {
  const switches = sections.vitalsSwitches ?? []
  if (switches.length === 0) return ""
  const current = { required: true, bloodPressure: true, heartRate: true, respiratoryRate: true, ...(config.vitals ?? {}) }
  const box = (entry: { key: keyof PreopVitalsSettingsView; labelEn: string; labelBg: string }) =>
    `<label class="check"><input type="checkbox" name="vitals_${entry.key}" value="true" ${current[entry.key] ? "checked" : ""} data-testid="vitals-${entry.key}-${population.id}"> ${label(entry, locale)}</label>`
  const [section, ...readings] = switches
  return `<fieldset class="checks" data-testid="vitals-${population.id}"><legend>${localize(locale, "Vital signs before the operation", "Жизнени показатели преди операцията")}</legend><p class="component-detail">${localize(locale,
    "Ticked: must be filled in, or marked as impossible to measure, before the case can go on to the operation and be closed. Not ticked: can be left empty. The fields are shown either way.",
    "Отметнато: трябва да се попълни или да се отбележи, че не може да се измери, преди случаят да продължи към операцията и да бъде приключен. Неотметнато: може да остане празно. Полетата се показват и в двата случая.")}</p>${section ? box(section) : ""}<p class="component-detail">${localize(locale,
    "When vital signs are required, which of them:",
    "Ако жизнените показатели са задължителни, кои от тях:")}</p>${readings.map(box).join("")}</fieldset>`
}

/** Whether a current medication can be typed when it is not in the list (1.11.0); off by default. */
function medicationsSwitch(sections: PreopSectionsView, config: PreopSectionConfigView, population: Population, locale: StatusLocale): string {
  const entry = sections.medicationsFreeText
  if (!entry) return ""
  return `<fieldset class="checks" data-testid="medications-free-text-${population.id}"><legend>${localize(locale, "Current medications", "Хронични медикаменти")}</legend><label class="check"><input type="checkbox" name="medications_free_text" value="true" ${config.medicationsFreeText === true ? "checked" : ""} data-testid="medications-free-text-box-${population.id}"> ${label(entry, locale)}</label><p class="component-detail">${localize(locale,
    "A medication typed this way has no code: research receives it as written text, and the allergy check compares it by name only.",
    "Така въведеното лекарство няма код: към изследванията отива като написан текст, а проверката за алергии го сравнява само по име.")}</p></fieldset>`
}

/** Preoperative form · Sections. */
export function renderPreopSectionsEditor(sections: PreopSectionsView | undefined, locale: StatusLocale): string {
  if (!sections) return ""
  return `<div class="component preop-populations" id="preop-sections"><h3>${localize(locale, "Sections of the preoperative form", "Раздели на предоперативната форма")}</h3><p>${localize(locale,
    "A section switched off is not shown and its questions are not asked; the sections needed to continue to intraop are always on. A change applies to every case from its next load; what a case already holds is kept.",
    "Изключеният раздел не се показва и въпросите му не се задават. Промяната важи от следващото отваряне на случая; вече въведеното се запазва.")}</p><h4>${localize(locale, "Always on", "Винаги включени")}</h4>${fixedList(sections.fixed, locale)}${byPopulation("sections", locale, (population, anchor) => sectionSwitches(sections, population, anchor, "PREOP", locale))}</div>`
}

/** Postoperative form: its sections, and what it asks for, for the operator to see. */
export function renderPostopFormEditor(sections: PreopSectionsView | undefined, locale: StatusLocale): string {
  if (!sections) return ""
  const fixed = sections.postopFixed ?? []
  const scales = `<details class="component" open><summary class="component-name">${localize(locale, "Pain and delirium scales, by age", "Скали за болка и делир по възраст")}</summary><ul class="component-detail" data-testid="postop-pain-rules">
<li>${localize(locale, "Adults, and children from 8 years: NRS, 0 to 10.", "От 8 години: NRS (0–10).")}</li>
<li>${localize(locale, "Children from 28 days to under 8 years: FLACC and FPS-R, both offered. The clinician fills in either, both or neither.", "От 28 дни до 8 години: FLACC и FPS-R; попълва се едната, двете или никоя.")}</li>
<li>${localize(locale, "Newborns under 28 days: NIPS.", "Новородени до 28 дни: NIPS.")}</li>
<li>${localize(locale, "Every child, 0 to 18 years: PAED for emergence delirium, when that section is on.", "Деца до 18 години: PAED за делир при събуждане (ако разделът е включен).")}</li>
<li>${localize(locale, "Each scale is scored item by item and the total is worked out; there are no sliders. The scales themselves are bundled and cannot be edited.", "Скалите са вградени; сборът се изчислява автоматично.")}</li>
</ul></details>`
  const finalise = `<details class="component"><summary class="component-name">${localize(locale, "What a case needs before it can be finalised", "Какво е нужно за приключване на случай")}</summary><ul class="component-detail" data-testid="finalise-requirements">
<li>${localize(locale, "Preop: age, sex, height, weight; diagnosis and procedure; the vital signs set as required (Preoperative form → Sections); Mallampati (or unable to obtain); ASA.", "Предоперативно: възраст, пол, ръст, тегло; диагноза и процедура; задължителните жизнени показатели (вижте „Предоперативна форма“ → „Раздели“); Mallampati (или „невъзможно за оценка“); ASA.")}</li>
<li>${localize(locale, "Intraop: start and end time, the technique, no entries after the end, every infusion stop confirmed.", "Интраоперативно: начален и краен час, техника; без записи след края; потвърдено спиране на всяка инфузия.")}</li>
<li>${localize(locale, "Postop: every item of the recovery score (Aldrete for adults, Steward for children) and the disposition.", "Следоперативно: всички показатели на скора при възстановяване (Aldrete при възрастни, Steward при деца) и насочването.")}</li>
</ul><p class="component-detail">${localize(locale, "These are fixed by the release, not by Status. Fields needed to finalise carry a red star in the forms.", "Полетата, нужни за приключване, са отбелязани с червена звездичка във формите.")}</p></details>`
  return `<div class="component preop-populations" id="postop-sections"><h3>${localize(locale, "Sections of the postoperative form", "Раздели на следоперативната форма")}</h3><p>${localize(locale,
    "A section switched off is not shown. The recovery score and the disposition are always on: a case cannot be finalised without them.",
    "Изключеният раздел не се показва.")}</p><h4>${localize(locale, "Always on", "Винаги включени")}</h4>${fixedList(fixed, locale)}${byPopulation("postop", locale, (population, anchor) => sectionSwitches(sections, population, anchor, "POSTOP", locale))}${scales}${finalise}</div>`
}

function hoursText(mode: string, locale: StatusLocale): string {
  return mode === "REQUIRED" ? localize(locale, "hours required", "с часове (задължително)")
    : mode === "OPTIONAL" ? localize(locale, "hours optional", "с часове (по избор)")
    : localize(locale, "no hours", "без часове")
}

function orderRow(option: PreopOrderOptionView, locale: StatusLocale): string {
  const key = escapeHtml(option.key)
  const text = option.bundled
    ? `<strong>${label(option, locale)}</strong><span class="component-detail">${localize(locale, "Bundled", "Вграден")}${option.list === "MEDICATION_INSTRUCTION" ? ` · ${hoursText(option.hoursMode, locale)}` : ""}</span>`
    : `<span class="form-grid"><label>EN<input name="labelEn_${key}" maxlength="200" required value="${escapeHtml(option.labelEn)}"></label><label>BG<input name="labelBg_${key}" maxlength="200" required value="${escapeHtml(option.labelBg)}"></label></span><label class="check"><input type="checkbox" name="remove_${key}" value="true"> ${localize(locale, "Remove this row", "Премахване")}</label>`
  return `<li class="preop-order-row" data-order-key="${key}"><label class="check"><input type="checkbox" name="enabled_${key}" value="true" ${option.enabled ? "checked" : ""} aria-label="${localize(locale, "Offered", "Включен")}"></label><input class="order-number" name="order_${key}" type="number" min="0" max="10000" value="${option.sortOrder}" aria-label="${localize(locale, "Order", "Ред")}"><span class="preop-order-label">${text}</span></li>`
}

/** Preoperative form · Ward orders and medication instructions, with the specialties. */
export function renderPreopOrderListsEditor(sections: PreopSectionsView | undefined, locale: StatusLocale): string {
  if (!sections) return ""
  const lists = (population: Population, anchor: string) => {
    const config = sections.configs[population.id]
    if (!config) return ""
    const list = (id: "WARD_ORDER" | "MEDICATION_INSTRUCTION", title: string) => {
      const rows = config.orderOptions.filter(option => option.list === id).sort((left, right) => left.sortOrder - right.sortOrder)
      return `<h4 class="preop-group-heading">${title}</h4><ol class="preop-order-list" data-testid="order-list-${id}-${population.id}">${rows.map(row => orderRow(row, locale)).join("")}</ol>`
    }
    const add = `<fieldset class="component"><legend>${localize(locale, "Add a row of your own", "Нов ред")}</legend><div class="form-grid"><label>${localize(locale, "List", "Списък")}<select name="newList"><option value="WARD_ORDER">${localize(locale, "Ward orders", "Назначения в отделението")}</option><option value="MEDICATION_INSTRUCTION">${localize(locale, "Medication instructions", "Указания за медикаментите")}</option></select></label><label>${localize(locale, "Hours before surgery (medication rows)", "Часове преди операцията (за медикаменти)")}<select name="newHoursMode"><option value="OPTIONAL">${hoursText("OPTIONAL", locale)}</option><option value="REQUIRED">${hoursText("REQUIRED", locale)}</option><option value="NONE">${hoursText("NONE", locale)}</option></select></label><label>${localize(locale, "Text in English", "Текст на английски")}<input name="newLabelEn" maxlength="200"></label><label>${localize(locale, "Text in Bulgarian", "Текст на български")}<input name="newLabelBg" maxlength="200"></label></div><p class="component-detail">${localize(locale, "Both texts are needed. A new row is added last, switched on.", "Нужни са и двата текста.")}</p></fieldset>`
    return `<form method="post" action="/status/control/preop-sections#${anchor}"><input type="hidden" name="part" value="orders"><input type="hidden" name="population" value="${population.id}">${list("WARD_ORDER", localize(locale, "Preoperative ward orders", "Назначения в отделението"))}${list("MEDICATION_INSTRUCTION", localize(locale, "Medication instructions", "Указания за медикаментите"))}${add}${confirm(locale)}<button type="submit">${localize(locale, "Save the lists for", "Запазване за")} ${localize(locale, population.en, population.bg).toLowerCase()}</button></form>`
  }
  const specialties = (population: Population, anchor: string) => {
    const config = sections.configs[population.id]
    if (!config) return ""
    const on = new Set(config.consultSpecialtyKeys)
    const box = (item: PreopSectionsView["specialties"][number]) => `<label class="check"><input type="checkbox" name="spec_${escapeHtml(item.key)}" value="true" ${on.has(item.key) ? "checked" : ""}> ${label(item, locale)} <span class="component-detail mono">${escapeHtml(item.key)}</span></label>`
    const clinical = sections.specialties.filter(item => item.clinical)
    const others = sections.specialties.filter(item => !item.clinical)
    return `<form method="post" action="/status/control/preop-sections#${anchor}"><input type="hidden" name="part" value="specialties"><input type="hidden" name="population" value="${population.id}"><p class="component-detail">${localize(locale, "Specialties offered", "Включени специалности")}: ${on.size}</p><div class="checks cols">${clinical.map(box).join("")}</div><details><summary>${localize(locale, "Other specialties in the NHIS list (CL006)", "Други специалности (НЗИС)")}</summary><div class="checks cols">${others.map(box).join("")}</div></details>${confirm(locale)}<button type="submit">${localize(locale, "Save the specialties for", "Запазване за")} ${localize(locale, population.en, population.bg).toLowerCase()}</button></form>`
  }
  return `<div class="component preop-populations" id="preop-orders"><h3>${localize(locale, "Ward orders and medication instructions", "Назначения и указания за медикаментите")}</h3><p>${localize(locale,
    "The rows each list offers on the form, in order. A bundled row can be switched off but not renamed or removed; a row of your own can be edited or removed. A case keeps its own copy of what was ordered, so a change here alters no case.",
    "Вграден ред може само да се изключи; ваш ред може да се променя и премахва. Промяна тук не засяга вече назначеното в случаите.")}</p>${byPopulation("orders", locale, lists)}</div>
<div class="component preop-populations" id="preop-specialties"><h3>${localize(locale, "Consultation specialties", "Специалности за консултация")}</h3><p>${localize(locale,
    "The specialties a consultation order can name, from the NHIS list. Clinical doctor specialties are on by default.",
    "Специалностите, които може да се изберат при назначена консултация (от списъка на НЗИС).")}</p>${byPopulation("specialties", locale, specialties)}</div>`
}

/** The sub-tabs of the preoperative form's pages. */
export const PREOP_TABS = ["questions", "sections", "orders", "documents"] as const
export type PreopTab = typeof PREOP_TABS[number]

export function preopTabFor(section: string | undefined): PreopTab {
  const tab = section?.startsWith("preop/") ? section.slice("preop/".length) : "questions"
  return (PREOP_TABS as readonly string[]).includes(tab) ? tab as PreopTab : "questions"
}

export function renderPreopTabs(active: PreopTab, locale: StatusLocale): string {
  const labels: Record<PreopTab, string> = {
    sections: localize(locale, "Sections", "Раздели"),
    questions: localize(locale, "Questions", "Въпроси"),
    orders: localize(locale, "Orders and instructions", "Назначения и указания"),
    documents: localize(locale, "Summary and consent", "Обобщение и съгласие"),
  }
  return `<nav class="statusnav subnav preop-tabs" aria-label="${localize(locale, "Preoperative form", "Предоперативна форма")}">${PREOP_TABS.map(tab =>
    `<a href="/status/control/preop${tab === "questions" ? "" : `/${tab}`}"${tab === active ? ' aria-current="page"' : ""}>${labels[tab]}</a>`).join("")}</nav>`
}
