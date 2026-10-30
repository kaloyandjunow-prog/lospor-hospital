import { ControlPlaneClientError, type DrugColorDrugView, type DrugColorGroupView, type DrugColorsView, type DrugColorUpdate } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"

/**
 * The drug colours page (10.0.0): a colour for each drug group, and for any
 * drug a colour of its own over its group's. A drug's bolus and its infusion
 * share it. Laid out as the chart's menus are: groups that open onto their
 * drugs, and a search across all of them. One colour is changed at a time in
 * an editor at the top; plain HTML forms that work without JavaScript.
 */

export const DRUG_COLORS_PATH = "/status/control/drug-colors"
const EDITOR = "drug-color-editor"
const HEX = /^#[0-9a-f]{6}$/

export type DrugColorsQuery = { q?: string; edit?: string }

type Target =
  | { scope: "GROUP"; group: DrugColorGroupView }
  | { scope: "DRUG"; group: DrugColorGroupView; drug: DrugColorDrugView }

function findTarget(view: DrugColorsView, scope: unknown, name: unknown): Target | null {
  if (typeof name !== "string") return null
  for (const group of view.groups) {
    if (scope === "GROUP" && group.name === name) return { scope: "GROUP", group }
    if (scope === "DRUG") {
      const drug = group.drugs.find(entry => entry.name === name)
      if (drug) return { scope: "DRUG", group, drug }
    }
  }
  return null
}

function targetFromQuery(view: DrugColorsView, edit: string | undefined): Target | null {
  const at = edit?.indexOf(":") ?? -1
  return edit && at > 0 ? findTarget(view, edit.slice(0, at), edit.slice(at + 1)) : null
}

/** The colour a group is drawn in: its own, else the bundled one. */
const groupColor = (group: DrugColorGroupView) => group.color ?? group.bundledColor
/** The colour a drug is drawn in: its own, else its group's chosen one, else the bundled one. */
const drugColor = (group: DrugColorGroupView, drug: DrugColorDrugView) => drug.color ?? group.color ?? drug.bundledColor

/** The update a submitted editor asks for. Throws ControlPlaneClientError for one it cannot be. */
export function drugColorUpdateFromForm(view: DrugColorsView | null | undefined, body: Record<string, unknown>): DrugColorUpdate {
  const target = view ? findTarget(view, body.scope, body.name) : null
  if (!target) throw new ControlPlaneClientError("DRUG_COLOR_TARGET_NOT_FOUND")
  const name = target.scope === "GROUP" ? target.group.name : target.drug.name
  const choice = typeof body.choice === "string" ? body.choice.trim().toLowerCase() : ""
  if (choice === "reset") return { scope: target.scope, name, color: null }
  const color = choice === "custom" ? (typeof body.custom === "string" ? body.custom.trim().toLowerCase() : "") : choice
  if (!HEX.test(color)) throw new ControlPlaneClientError("DRUG_COLOR_INVALID")
  return { scope: target.scope, name, color }
}

function swatch(hex: string, size: "small" | "large" = "small"): string {
  return `<span class="dc-swatch${size === "large" ? " dc-swatch-large" : ""}" style="background:${escapeHtml(hex)}" aria-hidden="true"></span>`
}

const groupLabel = (group: DrugColorGroupView, locale: StatusLocale) => escapeHtml(locale === "bg" ? group.labelBg : group.labelEn)
const drugLabel = (drug: DrugColorDrugView, locale: StatusLocale) => escapeHtml(locale === "bg" && drug.labelBg ? drug.labelBg : drug.name)

function editHref(scope: "GROUP" | "DRUG", name: string, query: DrugColorsQuery): string {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  params.set("edit", `${scope}:${name}`)
  return escapeHtml(`${DRUG_COLORS_PATH}?${params.toString()}#${EDITOR}`)
}

function drugRow(group: DrugColorGroupView, drug: DrugColorDrugView, query: DrugColorsQuery, locale: StatusLocale, showGroup = false): string {
  const kinds = [drug.bolus ? localize(locale, "bolus", "болус") : "", drug.infusion ? localize(locale, "infusion", "инфузия") : ""].filter(Boolean).join(" · ")
  const source = drug.color
    ? localize(locale, "own colour", "собствен цвят")
    : group.color ? localize(locale, "group colour", "цвят на групата") : localize(locale, "bundled colour", "вграден цвят")
  const english = locale === "bg" && drug.labelBg && drug.labelBg !== drug.name ? ` <span class="component-detail">${escapeHtml(drug.name)}</span>` : ""
  const inGroup = showGroup ? `<span class="component-detail">${groupLabel(group, locale)}</span>` : ""
  return `<li class="dc-row" data-drug="${escapeHtml(drug.name)}">${swatch(drugColor(group, drug))}<span class="dc-name"><strong>${drugLabel(drug, locale)}</strong>${english}${inGroup}<span class="component-detail">${kinds} · ${source}</span></span><a class="dc-change" href="${editHref("DRUG", drug.name, query)}">${localize(locale, "Change", "Промяна")}</a></li>`
}

function editor(view: DrugColorsView, target: Target, query: DrugColorsQuery, locale: StatusLocale): string {
  const own = target.scope === "GROUP" ? target.group.color : target.drug.color
  const shown = target.scope === "GROUP" ? groupColor(target.group) : drugColor(target.group, target.drug)
  const name = target.scope === "GROUP" ? target.group.name : target.drug.name
  const title = target.scope === "GROUP"
    ? `${localize(locale, "Colour of the group", "Цвят на групата")} <strong>${groupLabel(target.group, locale)}</strong>`
    : `${localize(locale, "Colour of", "Цвят на")} <strong>${drugLabel(target.drug, locale)}</strong> <span class="component-detail">${groupLabel(target.group, locale)}</span>`
  const inPalette = own !== null && view.palette.some(color => color.hex === own)
  const palette = view.palette.map(color => {
    const label = escapeHtml(locale === "bg" ? color.labelBg : color.labelEn)
    return `<label class="dc-choice" title="${label}"><input type="radio" name="choice" value="${escapeHtml(color.hex)}"${own === color.hex ? " checked" : ""}>${swatch(color.hex, "large")}<span class="sr-only">${label}</span></label>`
  }).join("")
  // What clearing gives: a drug follows its group, a group the bundled colour.
  const fallback = target.scope === "GROUP" ? target.group.bundledColor : target.group.color ?? target.drug.bundledColor
  const resetText = target.scope === "GROUP"
    ? localize(locale, "The bundled colour", "Вграденият цвят")
    : target.group.color ? localize(locale, "Follow the group's colour", "Цветът на групата") : localize(locale, "The bundled colour", "Вграденият цвят")
  const clear = query.q ? `${DRUG_COLORS_PATH}?${new URLSearchParams({ q: query.q }).toString()}` : DRUG_COLORS_PATH
  return `<div class="component dc-editor" id="${EDITOR}" data-testid="drug-color-editor"><h3>${title}</h3><p class="component-detail">${localize(locale, "Drawn now in", "Сега се показва в")} ${swatch(shown)} <span class="mono">${escapeHtml(shown)}</span>${target.scope === "DRUG" ? ` · ${localize(locale, "its bolus and its infusion alike", "еднакво за болус и инфузия")}` : ""}</p>
<form method="post" action="${DRUG_COLORS_PATH}#${EDITOR}"><input type="hidden" name="scope" value="${target.scope}"><input type="hidden" name="name" value="${escapeHtml(name)}">
<fieldset><legend>${localize(locale, "Palette", "Палитра")}</legend><div class="dc-palette">${palette}</div></fieldset>
<fieldset><legend>${localize(locale, "Or a colour of your own", "Или свой цвят")}</legend><label class="check"><input type="radio" name="choice" value="custom"${own !== null && !inPalette ? " checked" : ""}> ${localize(locale, "This colour", "Този цвят")} <input class="dc-custom" type="color" name="custom" value="${escapeHtml(own ?? shown)}" aria-label="${localize(locale, "Your own colour", "Свой цвят")}"></label></fieldset>
<label class="check"><input type="radio" name="choice" value="reset"${own === null ? " checked" : ""}> ${resetText} ${swatch(fallback)}</label>
<p class="component-detail">${localize(locale,
    "Any colour is drawn so its text stays readable: a pale one is shown darker in the light theme, a deep one lighter in the dark theme.",
    "Всеки цвят се изобразява така, че текстът да остане четим: светъл цвят се показва по-тъмен в светлата тема, а тъмен — по-светъл в тъмната.")}</p>
<button type="submit">${localize(locale, "Save the colour", "Запазване на цвета")}</button> <a class="dc-close" href="${escapeHtml(clear)}">${localize(locale, "Close", "Затваряне")}</a></form></div>`
}

function matches(text: string | null | undefined, query: string): boolean {
  return Boolean(text && text.toLocaleLowerCase("bg").includes(query))
}

/** Hospital control · Drug colours. */
export function renderDrugColorsPage(view: DrugColorsView | null | undefined, locale: StatusLocale, query: DrugColorsQuery = {}): string {
  const intro = `<p>${localize(locale,
    "The colour of each drug on the intraoperative chart and in its menus, on the web and on the phone. A drug takes its group's colour unless it has one of its own; its bolus and its infusion share it. No case records a colour: every case, earlier ones too, is drawn in the colours set here.",
    "Цветът на всяко лекарство в интраоперативната карта и в менютата ѝ, в уеб и на телефона. Лекарството приема цвета на групата си, освен ако няма собствен; болусът и инфузията му го споделят. Нито един случай не записва цвят: всеки случай, включително по-ранните, се показва в цветовете, зададени тук.")}</p>`
  if (!view) {
    return `<div class="component" id="drug-colors">${intro}<div class="empty">${localize(locale, "This API does not offer the drug colours yet.", "Този API още не предлага цветовете на лекарствата.")}</div></div>`
  }
  const q = (query.q ?? "").trim().slice(0, 100)
  const needle = q.toLocaleLowerCase("bg")
  const target = targetFromQuery(view, query.edit)
  const search = `<form class="dc-search" method="get" action="${DRUG_COLORS_PATH}" role="search"><label>${localize(locale, "Search a drug or a group", "Търсене на лекарство или група")}<input type="search" name="q" value="${escapeHtml(q)}" maxlength="100" autocomplete="off"></label><button type="submit">${localize(locale, "Search", "Търсене")}</button>${q ? ` <a href="${DRUG_COLORS_PATH}">${localize(locale, "Show all", "Всички")}</a>` : ""}</form>`
  const shownQuery: DrugColorsQuery = q ? { q } : {}

  let list: string
  if (needle) {
    const groups = view.groups.filter(group => matches(group.labelEn, needle) || matches(group.labelBg, needle) || matches(group.name, needle))
    const drugs = view.groups.flatMap(group => group.drugs
      .filter(drug => matches(drug.name, needle) || matches(drug.labelBg, needle))
      .map(drug => drugRow(group, drug, shownQuery, locale, true)))
    const groupRows = groups.map(group => `<li class="dc-row">${swatch(groupColor(group))}<span class="dc-name"><strong>${groupLabel(group, locale)}</strong><span class="component-detail">${localize(locale, "group", "група")} · ${group.drugs.length}</span></span><a class="dc-change" href="${editHref("GROUP", group.name, shownQuery)}">${localize(locale, "Change", "Промяна")}</a></li>`)
    list = groupRows.length + drugs.length
      ? `<ul class="dc-list" data-testid="drug-color-results">${[...groupRows, ...drugs].join("")}</ul>`
      : `<div class="empty">${localize(locale, "Nothing matches.", "Няма съвпадения.")}</div>`
  } else {
    list = view.groups.map(group => {
      const own = group.color ? ` · ${localize(locale, "own colour", "собствен цвят")}` : ""
      const open = target && target.group.name === group.name ? " open" : ""
      return `<details class="component dc-group"${open} data-group="${escapeHtml(group.name)}"><summary class="component-name">${swatch(groupColor(group))} ${groupLabel(group, locale)} <span class="component-detail">${group.drugs.length}${own}</span></summary><p class="dc-group-actions"><a class="dc-change" href="${editHref("GROUP", group.name, shownQuery)}">${localize(locale, "Change the group's colour", "Промяна на цвета на групата")}</a></p><ul class="dc-list">${group.drugs.map(drug => drugRow(group, drug, shownQuery, locale)).join("")}</ul></details>`
    }).join("")
  }
  return `<div class="component" id="drug-colors">${intro}${search}</div>${target ? editor(view, target, shownQuery, locale) : ""}${list}`
}

export const DRUG_COLORS_STYLE = `.dc-swatch{display:inline-block;width:1.05rem;height:1.05rem;border-radius:50%;border:1px solid rgba(0,0,0,.25);vertical-align:-.2rem;flex:none}.dc-swatch-large{width:2rem;height:2rem}
.dc-list{list-style:none;padding:0;margin:.6rem 0 0;display:grid;gap:.35rem}.dc-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.65rem;align-items:center;border:1px solid var(--line);border-radius:9px;padding:.5rem .75rem;background:var(--card)}
.dc-name{min-width:0;display:flex;flex-direction:column}.dc-name strong{overflow-wrap:anywhere}.dc-change{white-space:nowrap}.dc-group summary{cursor:pointer;display:flex;gap:.55rem;align-items:center}.dc-group-actions{margin:.6rem 0 0}
.dc-search{display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end}.dc-search label{flex:1 1 16rem;margin-top:.5rem}.dc-search button{margin-top:0}
.dc-palette{display:grid;grid-template-columns:repeat(auto-fill,minmax(2.6rem,1fr));gap:.45rem;margin:.4rem 0}.dc-choice{position:relative;margin:0;display:grid;place-items:center;padding:.2rem;cursor:pointer}.dc-choice input{position:absolute;opacity:0;width:1px;height:1px}
.dc-choice input:checked+.dc-swatch{outline:3px solid var(--ink);outline-offset:2px}.dc-choice input:focus-visible+.dc-swatch{outline:3px dashed var(--info);outline-offset:2px}.check .dc-custom{width:3.4rem;height:2.3rem;padding:.15rem;margin:0 0 0 .4rem;flex:none}.dc-editor{border:2px solid var(--info)}.dc-close{margin-left:.8rem}`
