import type { ConsentPopulation, PreopDocumentsView } from "./control-plane.js"
import { CONSENT_TEXT_MAX_LENGTH } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"

const POPULATIONS: Array<{ id: ConsentPopulation; anchor: string; en: string; bg: string }> = [
  { id: "ADULT", anchor: "consent-adults", en: "Adults and patients of 14 to 18", bg: "Възрастни и пациенти от 14 до 18 г." },
  { id: "PEDIATRIC", anchor: "consent-children", en: "Children under 14", bg: "Деца до 14 г." },
]

function passwordAndReason(locale: StatusLocale): string {
  return `<label>${localize(locale, "Reason for the change", "Причина за промяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>`
}

function versionLabel(locale: StatusLocale, version: number): string {
  return version === 0 ? localize(locale, "bundled text", "вграден текст") : `${localize(locale, "version", "вариант")} ${version}`
}

/**
 * The preop summary page and the written consent: two switches, and one
 * text editor per population with its version history. Plain HTML forms
 * that work without JavaScript, like the rest of Status. Saving a text makes
 * a new version; earlier versions stay readable for the sheets that carried
 * them, so there is no delete.
 */
export function renderPreopDocuments(documents: PreopDocumentsView | undefined, locale: StatusLocale): string {
  if (!documents) return ""
  const switches = `<form method="post" action="/status/control/preop-documents#preop-documents"><div class="checks">
<label class="check"><input type="checkbox" name="summaryEnabled" value="true" ${documents.summaryEnabled ? "checked" : ""} data-testid="preop-summary-switch"> ${localize(locale, "Preop summary page between preop and intraop", "Страница с предоперативно обобщение между предоперативния и интраоперативния етап")}</label>
<label class="check"><input type="checkbox" name="consentEnabled" value="true" ${documents.consentEnabled ? "checked" : ""} data-testid="preop-consent-switch"> ${localize(locale, "Print the written consent with the summary", "Отпечатване на писменото информирано съгласие с обобщението")}</label>
</div><p class="component-detail">${localize(locale,
    "Both are off until switched on here. With the summary on, a clinician who finishes the preop assessment reaches a summary page: keep the case or hand it over, print, then start intraop. The consent prints after the summary and needs it; the patient or parent signs it on paper. Patient names are never stored: the sheets print blank lines for them.",
    "И двете са изключени, докато не бъдат включени тук. Когато обобщението е включено, лекарят, завършил предоперативния преглед, вижда страница с обобщение: задържа случая или го предава, отпечатва и започва интраоперативния етап. Съгласието се отпечатва след обобщението и изисква него; пациентът или родителят го подписва на хартия. Имената на пациентите никога не се съхраняват: листовете оставят празни редове за тях.")}</p>${passwordAndReason(locale)}<button type="submit">${localize(locale, "Save the settings", "Запазване на настройките")}</button></form>`

  const help = `<details class="component-detail"><summary>${localize(locale, "How to write the text", "Как се пише текстът")}</summary><ul>
<li>${localize(locale, "A blank line starts a new paragraph.", "Празен ред започва нов абзац.")}</li>
<li><code>## </code>${localize(locale, "at the start of a line makes a heading.", "в началото на ред прави заглавие.")}</li>
<li><code>- </code>${localize(locale, "at the start of a line makes a list item.", "в началото на ред прави точка от списък.")}</li>
<li><code>**…**</code> ${localize(locale, "makes words bold.", "прави думите удебелени.")}</li>
<li>${localize(locale, "These fields are filled in from the case when the sheet prints:", "Тези полета се попълват от случая при отпечатване:")} <code>{{hospital}}</code> <code>{{diagnosis}}</code> <code>{{procedure}}</code> <code>{{date}}</code> <code>{{anaesthetist}}</code>. ${localize(locale, "Any other {{…}} is refused.", "Всяко друго {{…}} се отказва.")}</li>
<li>${localize(locale, "The patient's name, ID and the signature lines are fixed parts of the sheet, not of the text. Who signs follows the age: a parent under 14; the patient and a parent from 14 to 18; the patient from 18; the anaesthetist always.", "Името, ИД на пациента и редовете за подпис са постоянна част от листа, а не от текста. Кой подписва зависи от възрастта: родител под 14 г.; пациентът и родител от 14 до 18 г.; пациентът от 18 г.; анестезиологът винаги.")}</li>
</ul></details>`

  const editor = (population: typeof POPULATIONS[number]) => {
    const current = documents.templates[population.id]
    const bundled = documents.bundled[population.id]
    const history = documents.history[population.id]
    const rows = history.map(entry => `<li><strong>${escapeHtml(versionLabel(locale, entry.version))}</strong>${entry.version === current.version ? ` · ${localize(locale, "printing now", "отпечатва се")}` : ""}${entry.createdAt ? ` · ${escapeHtml(entry.createdAt.slice(0, 16).replace("T", " "))}` : ""}${entry.changeReason ? ` · ${escapeHtml(entry.changeReason)}` : ""} · <span class="mono">${escapeHtml(entry.sha256.slice(0, 12))}</span></li>`).join("")
    return `<details class="component" id="${population.anchor}"${population.id === "ADULT" ? " open" : ""}><summary class="component-name">${localize(locale, population.en, population.bg)} · ${escapeHtml(versionLabel(locale, current.version))}</summary>
<form method="post" action="/status/control/consent-template#${population.anchor}"><input type="hidden" name="population" value="${population.id}">
<label>${localize(locale, "Title", "Заглавие")}<input name="title" maxlength="200" required value="${escapeHtml(current.title)}"></label>
<label>${localize(locale, "Text", "Текст")}<textarea class="consent-text" name="body" rows="24" maxlength="${CONSENT_TEXT_MAX_LENGTH}" required spellcheck="true" data-testid="consent-text-${population.id}">${escapeHtml(current.body)}</textarea></label>
${passwordAndReason(locale)}<button type="submit">${localize(locale, "Save as a new version", "Запазване като нов вариант")}</button></form>
<details class="component-detail"><summary>${localize(locale, "The bundled text, to start again from", "Вграденият текст, за да започнете отначало")}</summary><p>${localize(locale, "Copy it into the box above and save. The bundled text follows Document №2 of the paediatric hospital; check it against your hospital's own form.", "Копирайте го в полето отгоре и запазете. Вграденият текст следва Документ №2 на детската болница; сверете го с формуляра на вашата болница.")}</p><textarea class="consent-text" readonly rows="10">${escapeHtml(`${bundled.title}\n\n${bundled.body}`)}</textarea></details>
<h4>${localize(locale, "Versions", "Варианти")}</h4><ul class="component-detail" data-testid="consent-history-${population.id}">${rows}</ul>
</details>`
  }

  return `<div class="component" id="preop-documents"><h3>${localize(locale, "Preop summary and written consent", "Предоперативно обобщение и писмено съгласие")}</h3>${switches}<h4>${localize(locale, "Consent texts", "Текстове на съгласието")}</h4><p class="component-detail">${localize(locale, "Each save is a new version. A printed sheet records the version and fingerprint of its text, so earlier versions are never deleted. Under Закон за здравето чл. 89 consent to general anaesthesia is given in writing; the text should name the anaesthesia, its risks and alternatives (чл. 88).", "Всяко запазване е нов вариант. Отпечатаният лист записва варианта и отпечатъка на своя текст, затова старите варианти не се изтриват. Според чл. 89 от Закона за здравето съгласието за обща анестезия е писмено; текстът трябва да описва анестезията, рисковете и алтернативите ѝ (чл. 88).")}</p>${help}${POPULATIONS.map(editor).join("")}</div>`
}
