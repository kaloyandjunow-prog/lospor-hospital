import type { LabScanAlias, LabScanSettingsView, LabScanTestResult } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"

/**
 * The lab scan's local settings in Status → AI (Hospital 1.9.1): the names
 * this hospital's laboratory prints, each tied to a lab library entry, a short
 * note, and a test scan with the settings as they stand in the form.
 *
 * The released prompt is not shown or settable: its rules (copy, do not
 * convert, what sO2 and tCO2 are not) and the shape of its answer are tested
 * with every release. The names and the note are added after it. A plain HTML
 * form; the test uses the same form, so nothing typed is lost to a test.
 */

export const LAB_SCAN_SAVE_PATH = "/status/control/external-ai/lab-scan"
export const LAB_SCAN_TEST_PATH = "/status/control/external-ai/lab-scan/test"
/** A 10 MB image in a form body, and the settings beside it. */
export const LAB_SCAN_FORM_MAX_BYTES = 11_000_000
export const LAB_SCAN_IMAGE_MAX_BYTES = 10_485_760
export const LAB_SCAN_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

/** What the form held when it was sent, shown again with the test's rows or a refusal. */
export type LabScanDraft = {
  aliasesText: string
  instructions: string
  test?: LabScanTestResult
  /** Lines of the names box that cannot be used, by line number (1-based). */
  problems?: { line: number; text: string; kind: "format" | "unknown-test" | "duplicate" | "too-long" }[]
}

const key = (printed: string) => printed.normalize("NFC").trim().replace(/\s+/g, " ").replace(/[:.]$/, "").toLocaleLowerCase("bg")

/**
 * One name per line, "printed name = library name". Blank lines are skipped.
 * The library name must be one Status offers; the API checks again.
 */
export function parseAliasLines(text: string, libraryNames: readonly string[], printedMax = 80): {
  aliases: LabScanAlias[]
  problems: NonNullable<LabScanDraft["problems"]>
} {
  const library = new Map(libraryNames.map(name => [name.toLocaleLowerCase("en"), name]))
  const aliases: LabScanAlias[] = []
  const problems: NonNullable<LabScanDraft["problems"]> = []
  const seen = new Set<string>()
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    const at = line.indexOf("=")
    const printed = at > 0 ? line.slice(0, at).trim() : ""
    const target = at > 0 ? line.slice(at + 1).trim() : ""
    if (!printed || !target) return void problems.push({ line: index + 1, text: line, kind: "format" })
    const test = library.get(target.toLocaleLowerCase("en"))
    if (!test) return void problems.push({ line: index + 1, text: line, kind: "unknown-test" })
    if (printed.length > printedMax) return void problems.push({ line: index + 1, text: line, kind: "too-long" })
    if (seen.has(key(printed))) return void problems.push({ line: index + 1, text: line, kind: "duplicate" })
    seen.add(key(printed))
    aliases.push({ printed, test })
  })
  return { aliases, problems }
}

export function aliasesToText(aliases: readonly LabScanAlias[]): string {
  return aliases.map(alias => `${alias.printed} = ${alias.test}`).join("\n")
}

function problemText(kind: NonNullable<LabScanDraft["problems"]>[number]["kind"], locale: StatusLocale): string {
  switch (kind) {
    case "format": return localize(locale, "write it as: printed name = library name", "напишете го като: отпечатано име = изследване от каталога")
    case "unknown-test": return localize(locale, "the name after = is not in the lab library (see the list below)", "името след = го няма в каталога на изследванията (вижте списъка по-долу)")
    case "duplicate": return localize(locale, "this printed name is already on an earlier line", "това отпечатано име вече е на по-горен ред")
    case "too-long": return localize(locale, "the printed name is longer than 80 characters", "отпечатаното име е по-дълго от 80 знака")
  }
}

function renderTestResult(test: LabScanTestResult, locale: StatusLocale): string {
  const rows = test.results.map(row => {
    const printed = row.sourceValue === row.value && row.sourceUnit === row.unit ? "" : `${escapeHtml(row.sourceValue)} ${escapeHtml(row.sourceUnit)}`
    return `<tr><td>${escapeHtml(row.test)}</td><td>${escapeHtml(row.value)} ${escapeHtml(row.unit)}</td><td>${printed}</td><td>${row.confident ? localize(locale, "yes", "да") : localize(locale, "no — check it", "не — проверете")}</td></tr>`
  }).join("")
  const empty = test.unreadable
    ? localize(locale, "The model's answer could not be read. Try again, or a clearer photo.", "Отговорът на модела не можа да бъде разчетен. Опитайте отново или с по-ясна снимка.")
    : localize(locale, "No result was read from this image.", "От тази снимка не беше разчетен нито един резултат.")
  return `<div class="lab-scan-test" data-testid="lab-scan-test-result">
    <h4>${localize(locale, "Test scan", "Пробно разчитане")} · ${escapeHtml(test.model)}</h4>
    <p class="component-detail">${localize(locale, "This is what a clinician would be offered for this image with the settings in the form. Nothing was saved and no case was changed.", "Това би получил лекар за тази снимка с настройките във формата. Нищо не е запазено и никой случай не е променен.")}</p>
    ${test.results.length === 0 ? `<p>${empty}</p>` : `<table><thead><tr><th>${localize(locale, "Test", "Изследване")}</th><th>${localize(locale, "Value", "Стойност")}</th><th>${localize(locale, "As printed", "Както е отпечатано")}</th><th>${localize(locale, "Offered ticked", "Отбелязано по подразбиране")}</th></tr></thead><tbody>${rows}</tbody></table>`}
  </div>`
}

export function renderLabScanPanel(view: LabScanSettingsView | undefined, locale: StatusLocale, draft?: LabScanDraft): string {
  if (!view) return ""
  const aliasesText = draft?.aliasesText ?? aliasesToText(view.aliases)
  const instructions = draft?.instructions ?? view.instructions
  const changed = view.changedAt
    ? new Date(view.changedAt).toLocaleString(locale === "bg" ? "bg-BG" : "en-GB", { timeZone: "Europe/Sofia" })
    : localize(locale, "never — the scan runs as released", "никога — разчитането е както е издадено")
  const problems = draft?.problems?.length
    ? `<div class="error" role="alert" data-testid="lab-scan-problems"><p>${localize(locale, "These lines cannot be used. Nothing was saved or sent.", "Тези редове не могат да се използват. Нищо не е запазено или изпратено.")}</p><ul>${
      draft.problems.map(problem => `<li>${localize(locale, "Line", "Ред")} ${problem.line}: <code>${escapeHtml(problem.text)}</code> — ${problemText(problem.kind, locale)}</li>`).join("")}</ul></div>`
    : ""
  return `<div class="component" data-testid="lab-scan-settings">
    <h3>${localize(locale, "Reading lab reports: this hospital's names and notes", "Разчитане на лабораторни резултати: имена и указания на болницата")}</h3>
    <p class="component-detail">${localize(locale,
      "The scan's own instructions are part of each release and tested with it; they cannot be changed here. What can be added: the names your laboratory prints, each tied to a test of the lab library, and a short note about your reports. A printed name in the table always goes to its test, whatever the model reads. Try the settings on a photo before saving them.",
      "Основните инструкции за разчитане са част от всяко издание и се тестват с него; тук не могат да се променят. Може да се добавят: имената, които вашата лаборатория печата, всяко свързано с изследване от каталога, и кратки указания за вашите листове. Отпечатано име от таблицата винаги отива към своето изследване, каквото и да разчете моделът. Пробвайте настройките на снимка, преди да ги запазите.")}</p>
    <div class="facts"><div class="fact"><span>${localize(locale, "Last changed", "Последна промяна")}</span><strong>${escapeHtml(changed)}</strong></div><div class="fact"><span>${localize(locale, "Names in the table", "Имена в таблицата")}</span><strong>${view.aliases.length}</strong></div></div>
    ${problems}
    <form method="post" action="${LAB_SCAN_SAVE_PATH}" enctype="multipart/form-data">
      <label>${localize(locale, "Names your laboratory prints — one per line: printed name = library test", "Имена, които лабораторията печата — по едно на ред: отпечатано име = изследване от каталога")}
        <textarea name="aliases" rows="8" spellcheck="false" placeholder="ctHb = Haemoglobin (Hb)&#10;Лев. = Leucocytes (WBC)" data-testid="lab-scan-aliases">${escapeHtml(aliasesText)}</textarea></label>
      <details><summary>${localize(locale, "Tests in the lab library", "Изследвания в каталога")} (${view.libraryNames.length})</summary><p class="component-detail lab-scan-library">${view.libraryNames.map(escapeHtml).join(" · ")}</p></details>
      <label>${localize(locale, "Notes about your reports", "Указания за вашите листове")} (${localize(locale, "up to", "до")} ${view.limits.instructions} ${localize(locale, "characters", "знака")})
        <textarea name="instructions" rows="4" maxlength="${view.limits.instructions}" data-testid="lab-scan-instructions">${escapeHtml(instructions)}</textarea></label>
      <label>${localize(locale, "Photo for a test scan — JPEG, PNG or WebP up to 10 MB. Use a report without patient details, or crop them off: the photo is sent to the AI provider.", "Снимка за пробно разчитане — JPEG, PNG или WebP до 10 MB. Използвайте лист без данни на пациента или ги изрежете: снимката се изпраща към доставчика на ИИ.")}
        <input type="file" name="image" accept="${LAB_SCAN_IMAGE_TYPES.join(",")}" data-testid="lab-scan-image"></label>
      <label>${localize(locale, "Change reason (to save)", "Причина за промяната (за запазване)")}<input name="reason" minlength="10" maxlength="1000" required></label>
      <label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
      <button type="submit" formaction="${LAB_SCAN_TEST_PATH}" formnovalidate data-testid="lab-scan-test">${localize(locale, "Test scan with these settings", "Пробно разчитане с тези настройки")}</button>
      <button type="submit" data-testid="lab-scan-save">${localize(locale, "Save names and notes", "Запазване на имената и указанията")}</button>
    </form>
    ${draft?.test ? renderTestResult(draft.test, locale) : ""}
  </div>`
}
