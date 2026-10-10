import { AsyncLocalStorage } from "node:async_hooks"
import type { ComponentStatus, ComponentView, DashboardData } from "./types.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"
import type { AttentionItem, AttentionLevel } from "./attention.js"
import type { GoLiveView } from "./go-live.js"

/**
 * Skins, theme and navigation for Status (Hospital 1.5.4).
 *
 * A skin is only a frame: navigation, layout and colour around the pages,
 * forms and routes Status already had. No route, form field or check behaves
 * differently under any skin, and "legacy" reproduces the pre-1.5.4 look. Each
 * operator picks a skin, a theme and a language under Display settings; the
 * choice lives in this browser's cookies, like the language always has.
 */

export const STATUS_SKINS = ["maphub", "sidebar", "inbox", "index", "console", "legacy"] as const
export type StatusSkin = typeof STATUS_SKINS[number]
export const DEFAULT_SKIN: StatusSkin = "maphub"
export const STATUS_THEMES = ["system", "light", "dark"] as const
export type StatusTheme = typeof STATUS_THEMES[number]
export type StatusAudience = "password" | "recovery"

export type UiContext = { skin: StatusSkin; theme: StatusTheme; path: string }

const store = new AsyncLocalStorage<UiContext>()

/** Runs a request with its display choices available to every renderer. */
export function withUi<T>(context: UiContext, run: () => T): T {
  return store.run(context, run)
}

/** The display choices of the request being rendered (defaults outside a request). */
export function ui(): UiContext {
  return store.getStore() ?? { skin: DEFAULT_SKIN, theme: "system", path: "/status/" }
}

export const isLegacy = (): boolean => ui().skin === "legacy"

export function parseSkin(value: unknown): StatusSkin | null {
  return typeof value === "string" && (STATUS_SKINS as readonly string[]).includes(value) ? value as StatusSkin : null
}

export function parseTheme(value: unknown): StatusTheme | null {
  return typeof value === "string" && (STATUS_THEMES as readonly string[]).includes(value) ? value as StatusTheme : null
}

// ── navigation ───────────────────────────────────────────────────────────────

export type NavItem = {
  id: string
  path: string
  /** Further paths on which this item is the current page. */
  also?: readonly string[]
  en: string
  bg: string
  descEn: string
  descBg: string
  audiences: readonly StatusAudience[]
}

export type NavGroup = { id: string; en: string; bg: string; items: readonly NavItem[] }

const BOTH: readonly StatusAudience[] = ["password", "recovery"]
const PASSWORD: readonly StatusAudience[] = ["password"]

/**
 * Every page, grouped by what it is for. A recovery session sees only what it
 * may open; the routes still enforce that themselves.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: "overview", en: "Overview", bg: "Преглед", items: [
    { id: "overview", path: "/status/", en: "Overview", bg: "Преглед", descEn: "Is LOSPOR working, and is there anything you must do?", descBg: "Работи ли LOSPOR и има ли нещо, което трябва да направите?", audiences: BOTH },
  ] },
  { id: "services", en: "Services", bg: "Услуги", items: [
    { id: "services", path: "/status/services", en: "Services and events", bg: "Услуги и събития", descEn: "How each part has worked, and what happened.", descBg: "Как е работила всяка част и какво се е случило.", audiences: BOTH },
  ] },
  { id: "connections", en: "Connections", bg: "Връзки", items: [
    { id: "hospital", path: "/status/control/ehr", en: "Hospital system", bg: "Болнична система", descEn: "The link that brings patient data from the hospital system.", descBg: "Връзката, която носи данните на пациента от болничната информационна система.", audiences: PASSWORD },
    { id: "codes", path: "/status/control/codes", en: "Codes", bg: "Кодове", descEn: "How the hospital's lab, drug and vital-sign codes become LOSPOR's.", descBg: "Как кодовете на болницата за изследвания, лекарства и жизнени показатели стават кодове на LOSPOR.", audiences: PASSWORD },
    { id: "terminology", path: "/status/terminology", en: "Terminology package", bg: "Терминологичен пакет", descEn: "The approved terminology package in use, and the one kept for going back.", descBg: "Използваният одобрен терминологичен пакет и този, запазен за връщане.", audiences: BOTH },
    { id: "central", path: "/status/control/central", en: "LOSPOR Central", bg: "LOSPOR Central", descEn: "Sends finished, de-identified cases to LOSPOR Central. Push only.", descBg: "Изпраща завършените обезличени случаи към LOSPOR Central. Само изходящо.", audiences: PASSWORD },
    { id: "ai", path: "/status/control/ai", en: "AI assistance", bg: "Помощ от ИИ", descEn: "Mistral (EU) for lab and monitor scans and adult advice.", descBg: "Mistral (ЕС) за сканиране на изследвания и монитор и за съвети при възрастни.", audiences: PASSWORD },
  ] },
  { id: "clinical", en: "Clinical setup", bg: "Клинични настройки", items: [
    { id: "preop", path: "/status/control/clinical", en: "Preoperative form and guidance", bg: "Предоперативна форма и насоки", descEn: "Which preoperative questions are asked, and the calculated guidance.", descBg: "Кои предоперативни въпроси се задават и изчислените насоки.", audiences: PASSWORD },
    { id: "identity", path: "/status/control/identity", en: "Patient identification", bg: "Идентификация на пациента", descEn: "Which number identifies a patient on screens and printouts.", descBg: "Кой номер идентифицира пациента на екрана и в разпечатките.", audiences: PASSWORD },
  ] },
  { id: "people", en: "People", bg: "Хора", items: [
    { id: "accounts", path: "/status/accounts", en: "Accounts", bg: "Профили", descEn: "Everyone who signs in to LOSPOR, and the Status administrators.", descBg: "Всички, които влизат в LOSPOR, и администраторите на Status.", audiences: PASSWORD },
    { id: "research", path: "/status/control/research", en: "Research access", bg: "Достъп за изследвания", descEn: "Research grants and the exact OMOP exports approved.", descBg: "Разрешения за изследвания и одобрените OMOP набори.", audiences: PASSWORD },
  ] },
  { id: "care", en: "Updates and backups", bg: "Актуализации и копия", items: [
    { id: "updates", path: "/status/release", en: "Updates", bg: "Актуализации", descEn: "New LOSPOR releases, checked against the signature before anything is installed.", descBg: "Нови версии на LOSPOR, проверени спрямо подписа преди инсталиране.", audiences: BOTH },
    { id: "backups", path: "/status/maintenance/backups", also: ["/status/maintenance", "/status/maintenance/offhost"], en: "Backups", bg: "Резервни копия", descEn: "Nightly copies, copies kept elsewhere, and restore drills.", descBg: "Нощни копия, копия извън сървъра и пробно възстановяване.", audiences: BOTH },
    { id: "server", path: "/status/maintenance/host-os", en: "Server", bg: "Сървър", descEn: "The Ubuntu server and the host agent that carries out maintenance.", descBg: "Сървърът с Ubuntu и агентът, който изпълнява поддръжката.", audiences: BOTH },
    { id: "security", path: "/status/maintenance/escrow", also: ["/status/maintenance/rotation"], en: "Security", bg: "Сигурност", descEn: "Installation secrets escrow and credential rotation.", descBg: "Копие на инсталационните тайни и смяна на данните за достъп.", audiences: BOTH },
    { id: "support", path: "/status/maintenance/support", also: ["/status/maintenance/settings", "/status/maintenance/advanced"], en: "Support and settings", bg: "Поддръжка и настройки", descEn: "Support bundle, site settings and advanced settings.", descBg: "Пакет за поддръжка, настройки на обекта и разширени настройки.", audiences: BOTH },
    { id: "golive", path: "/status/go-live", en: "Going live", bg: "Пускане в работа", descEn: "Everything to check and sign before clinical use.", descBg: "Всичко, което трябва да се провери и подпише преди клинична употреба.", audiences: BOTH },
  ] },
]

const EXTRA_PAGES: readonly NavItem[] = [
  { id: "preferences", path: "/status/preferences", en: "Display settings", bg: "Настройки на изгледа", descEn: "Skin, light or dark, and language. Kept in this browser.", descBg: "Облик, светъл или тъмен режим и език. Пазят се в този браузър.", audiences: BOTH },
  { id: "configure", path: "/status/configure", en: "Configure", bg: "Настройки", descEn: "Every setting, grouped by what it is for.", descBg: "Всички настройки, групирани по предназначение.", audiences: BOTH },
]

/** Every path the navigation can lead to, for the language switch's return address. */
export const NAV_PATHS: readonly string[] = [
  ...NAV_GROUPS.flatMap(group => group.items.flatMap(item => [item.path, ...(item.also ?? [])])),
  ...EXTRA_PAGES.map(item => item.path),
]

function visibleGroups(audience: StatusAudience): NavGroup[] {
  return NAV_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => item.audiences.includes(audience)) }))
    .filter(group => group.items.length > 0)
}

function normalizePath(path: string): string {
  return path.length > 8 && path.endsWith("/") ? path.slice(0, -1) : path
}

/** The navigation item for a path, or null. */
export function currentItem(path = ui().path): { group: NavGroup | null; item: NavItem } | null {
  const current = normalizePath(path)
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.path === current || item.also?.includes(current)) return { group, item }
    }
  }
  if (current === "/status/control") return { group: NAV_GROUPS[2]!, item: NAV_GROUPS[2]!.items[0]! }
  const extra = EXTRA_PAGES.find(item => item.path === current)
  return extra ? { group: null, item: extra } : null
}

const label = (locale: StatusLocale, entry: { en: string; bg: string }) => locale === "bg" ? entry.bg : entry.en
const current = (on: boolean) => on ? ' aria-current="page"' : ""

// ── headers ───────────────────────────────────────────────────────────────────

function profileMenu(locale: StatusLocale, audience: StatusAudience, languageForm: string): string {
  const who = audience === "recovery"
    ? localize(locale, "Console recovery session", "Сесия за възстановяване от конзолата")
    : localize(locale, "Appliance administrator", "Администратор на системата")
  return `<details class="profile"><summary><span class="avatar" aria-hidden="true">${audience === "recovery" ? "R" : "IT"}</span><span class="sr-only">${localize(locale, "Profile and display settings", "Профил и настройки на изгледа")}</span></summary><div class="profile-menu"><div class="who">${escapeHtml(who)}</div><a href="/status/preferences">${localize(locale, "Display settings", "Настройки на изгледа")}</a>${languageForm}<form class="logout" method="post" action="/status/logout"><button type="submit">${localize(locale, "Sign out", "Изход")}</button></form></div></details>`
}

function pageTitle(locale: StatusLocale, fallback: string): string {
  const found = currentItem()
  const title = found ? label(locale, found.item) : fallback
  const desc = found ? (locale === "bg" ? found.item.descBg : found.item.descEn) : ""
  const crumb = found?.group && found.group.items.length > 1 ? `<div class="crumb">${escapeHtml(label(locale, found.group))}</div>` : ""
  return `<div class="skin-title">${crumb}<h1>${escapeHtml(title)}</h1>${desc ? `<p>${escapeHtml(desc)}</p>` : ""}</div>`
}

/**
 * The header of an authenticated page under a non-legacy skin. Renders the
 * brand and profile row, the navigation for the skin, and the page title.
 */
export function skinHeader(locale: StatusLocale, audience: StatusAudience, languageForm: string, fallbackTitle: string): string {
  const skin = ui().skin
  const groups = visibleGroups(audience)
  const found = currentItem()
  const activeGroup = found?.group?.id ?? null
  const activeItem = found?.item.id ?? null
  const brand = `<a class="brand" href="/status/">LOSPOR Status</a>`
  const head = (nav = "") => `<header class="skin-head">${brand}${nav}${profileMenu(locale, audience, languageForm)}</header>`
  const chips = (group: NavGroup | undefined) => group && group.items.length > 1
    ? `<nav class="chips" aria-label="${escapeHtml(label(locale, group))}">${group.items.map(item => `<a href="${item.path}"${current(item.id === activeItem)}>${escapeHtml(label(locale, item))}</a>`).join("")}</nav>`
    : ""
  const groupOf = (id: string | null) => groups.find(group => group.id === id)
  const navLabel = localize(locale, "Appliance administration", "Управление на системата")

  if (skin === "maphub") {
    const tabs = `<nav class="tabs" aria-label="${navLabel}">${groups.map(group => `<a href="${group.items[0]!.path}"${current(group.id === activeGroup)}>${escapeHtml(label(locale, group))}</a>`).join("")}</nav>`
    return `${head(tabs)}${chips(groupOf(activeGroup))}${pageTitle(locale, fallbackTitle)}`
  }
  if (skin === "sidebar") {
    const nav = `<nav class="skin-nav" aria-label="${navLabel}">${groups.map(group => group.items.length === 1
      ? `<a class="nav-item" href="${group.items[0]!.path}"${current(group.items[0]!.id === activeItem)}>${escapeHtml(label(locale, group.items[0]!))}</a>`
      : `<div class="nav-group">${escapeHtml(label(locale, group))}</div>${group.items.map(item => `<a class="nav-item" href="${item.path}"${current(item.id === activeItem)}>${escapeHtml(label(locale, item))}</a>`).join("")}`).join("")}</nav>`
    return `${head()}${nav}${pageTitle(locale, fallbackTitle)}`
  }
  if (skin === "inbox") {
    const intent = activeGroup === "overview" ? "inbox" : activeGroup === "services" ? "watch" : activeGroup === "people" ? "people" : "configure"
    const intents = [
      ["inbox", "/status/", localize(locale, "Needs you", "За вас"), localize(locale, "things to do", "задачи")],
      ["watch", "/status/services", localize(locale, "Watch", "Наблюдение"), localize(locale, "services and events", "услуги и събития")],
      ["configure", "/status/configure", localize(locale, "Configure", "Настройки"), localize(locale, "every setting", "всички настройки")],
      ...(audience === "password" ? [["people", "/status/accounts", localize(locale, "People", "Хора"), localize(locale, "accounts and access", "профили и достъп")]] : []),
    ] as const
    const rail = `<nav class="skin-nav rail" aria-label="${navLabel}">${intents.map(([id, href, name, sub]) => `<a class="nav-item" href="${href}"${current(id === intent && (found?.item.id !== "configure" || id === "configure"))}><b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small></a>`).join("")}</nav>`
    return `${head()}${rail}${chips(groupOf(activeGroup))}${pageTitle(locale, fallbackTitle)}`
  }
  if (skin === "index") {
    const list = groups.map(group => `<div class="nav-group">${escapeHtml(label(locale, group))}</div>${group.items.map(item => `<a class="nav-item index-item" href="${item.path}"${current(item.id === activeItem)} data-search="${escapeHtml(`${item.en} ${item.bg} ${item.descEn} ${item.descBg}`.toLowerCase())}"><b>${escapeHtml(label(locale, item))}</b><small>${escapeHtml(locale === "bg" ? item.descBg : item.descEn)}</small></a>`).join("")}`).join("")
    const nav = `<nav class="skin-nav index" aria-label="${navLabel}"><label class="search"><span class="sr-only">${localize(locale, "Search settings", "Търсене в настройките")}</span><input type="search" id="status-index-search" placeholder="${localize(locale, "Search settings (press /)", "Търсене в настройките (натиснете /)")}" autocomplete="off"></label>${list}</nav><script src="/status/ui.js" defer></script>`
    return `${head()}${nav}${pageTitle(locale, fallbackTitle)}`
  }
  // console
  const menus = `<nav class="menus" aria-label="${navLabel}">${groups.map(group => group.items.length === 1
    ? `<a class="menu-top" href="${group.items[0]!.path}"${current(group.id === activeGroup)}>${escapeHtml(label(locale, group))}</a>`
    : `<details class="menu"><summary${group.id === activeGroup ? ' class="on"' : ""}>${escapeHtml(label(locale, group))}</summary><div class="menu-list">${group.items.map(item => `<a href="${item.path}"${current(item.id === activeItem)}>${escapeHtml(label(locale, item))}</a>`).join("")}</div></details>`).join("")}</nav>`
  return `${head(menus)}${pageTitle(locale, fallbackTitle)}`
}

/** The legacy header's way into Display settings, so legacy is never a dead end. */
export function legacyProfileLink(locale: StatusLocale): string {
  return `<a class="legacy-prefs" href="/status/preferences">${localize(locale, "Display settings", "Настройки на изгледа")}</a>`
}

/** Attributes for <html>: the skin and, unless it follows the computer, the theme. */
export function htmlAttributes(): string {
  const { skin, theme } = ui()
  return ` data-skin="${skin}"${theme === "system" ? "" : ` data-theme="${theme}"`}`
}

/** The search box of the settings-index skin. Served as a file: Status allows no inline script. */
export const STATUS_UI_SCRIPT = `(() => {
  const input = document.getElementById("status-index-search");
  if (!(input instanceof HTMLInputElement)) return;
  const items = [...document.querySelectorAll(".index-item")];
  const groups = [...document.querySelectorAll(".skin-nav.index .nav-group")];
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    for (const item of items) item.hidden = Boolean(query) && !(item.dataset.search || "").includes(query);
    for (const group of groups) {
      let next = group.nextElementSibling, any = false;
      while (next && !next.classList.contains("nav-group")) { if (!next.hidden) any = true; next = next.nextElementSibling; }
      group.hidden = !any;
    }
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") { const first = items.find(item => !item.hidden); if (first) first.click(); }
    if (event.key === "Escape") { input.value = ""; input.dispatchEvent(new Event("input")); }
  });
  document.addEventListener("keydown", event => {
    const target = event.target;
    const typing = target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(target.tagName);
    if ((event.key === "/" && !typing) || (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey))) { event.preventDefault(); input.focus(); input.select(); }
  });
})();`

// ── display settings ─────────────────────────────────────────────────────────

const SKIN_TEXT: Record<StatusSkin, { en: string; bg: string; descEn: string; descBg: string }> = {
  maphub: { en: "Map hub (default)", bg: "Карта (по подразбиране)", descEn: "The map is the front door. Groups across the top, pages as chips.", descBg: "Картата е входът. Групите са отгоре, страниците — като бутони." },
  sidebar: { en: "Sidebar", bg: "Странично меню", descEn: "Every page in a fixed menu on the left.", descBg: "Всички страници в постоянно меню вляво." },
  inbox: { en: "Inbox", bg: "Входяща кутия", descEn: "Organised by what you came to do: needs you, watch, configure, people.", descBg: "Подредено по това, за което сте дошли: за вас, наблюдение, настройки, хора." },
  index: { en: "Settings index", bg: "Указател на настройките", descEn: "A searchable list of every page. Press / to search.", descBg: "Списък на всички страници с търсене. Натиснете / за търсене." },
  console: { en: "Console", bg: "Конзола", descEn: "Drop-down menus and dense lists, for a big screen.", descBg: "Падащи менюта и плътни списъци за голям екран." },
  legacy: { en: "Legacy", bg: "Класически", descEn: "Status as it looked before 1.5.4, unchanged.", descBg: "Status, какъвто беше преди 1.5.4, без промени." },
}

export function preferencesBody(locale: StatusLocale, saved: boolean): string {
  const { skin, theme } = ui()
  const skinOption = (id: StatusSkin) => `<label class="choice${id === skin ? " on" : ""}"><input type="radio" name="skin" value="${id}"${id === skin ? " checked" : ""}><span class="thumb thumb-${id}" aria-hidden="true"><i></i><i></i><i></i></span><span><b>${escapeHtml(label(locale, SKIN_TEXT[id]))}</b><small>${escapeHtml(locale === "bg" ? SKIN_TEXT[id].descBg : SKIN_TEXT[id].descEn)}</small></span></label>`
  const themeText: Record<StatusTheme, [string, string]> = { system: ["Like this computer", "Като компютъра"], light: ["Light", "Светъл"], dark: ["Dark", "Тъмен"] }
  return `${saved ? `<div class="notice" role="status">${localize(locale, "Saved. These settings apply in this browser.", "Запазено. Настройките важат за този браузър.")}</div>` : ""}<form class="prefs" method="post" action="/status/preferences">
    <section class="section"><h2>${localize(locale, "Skin", "Облик")}</h2><div class="choices">${(["maphub", "sidebar", "inbox", "index", "console"] as const).map(skinOption).join("")}</div>
      <h3 class="legacy-h">${localize(locale, "Legacy skin", "Класически облик")}</h3><div class="choices">${skinOption("legacy")}</div></section>
    <section class="section"><h2>${localize(locale, "Light or dark", "Светъл или тъмен")}</h2><div class="choices compact">${STATUS_THEMES.map(id => `<label class="choice${id === theme ? " on" : ""}"><input type="radio" name="theme" value="${id}"${id === theme ? " checked" : ""}><span><b>${escapeHtml(localize(locale, themeText[id][0], themeText[id][1]))}</b></span></label>`).join("")}</div></section>
    <section class="section"><h2>${localize(locale, "Language", "Език")}</h2><div class="choices compact">${([["bg", "Български"], ["en", "English"]] as const).map(([id, name]) => `<label class="choice${id === locale ? " on" : ""}"><input type="radio" name="locale" value="${id}"${id === locale ? " checked" : ""}><span><b lang="${id}">${name}</b></span></label>`).join("")}</div></section>
    <button type="submit">${localize(locale, "Save", "Запазване")}</button></form>`
}

// ── overview, services, configure ────────────────────────────────────────────

const DOT: Record<string, string> = { operational: "good", degraded: "warn", outage: "bad", unknown: "off", "not-configured": "off" }
const LEVEL_TEXT: Record<AttentionLevel, [string, string]> = { now: ["Now", "Сега"], today: ["Today", "Днес"], soon: ["Soon", "Скоро"], note: ["Note", "Бележка"] }

/** Attention links pointed at /status/maintenance#section; each section now has its own page. */
export function attentionHref(href: string): string {
  const match = /^\/status\/maintenance#maintenance-([a-z-]+)$/.exec(href)
  return match ? `/status/maintenance/${match[1]}` : href
}

export function todoList(items: readonly AttentionItem[], locale: StatusLocale, limit?: number): string {
  const shown = items.slice(0, limit ?? items.length)
  if (!shown.length) return `<p class="empty">${localize(locale, "Nothing needs doing. Routine care is on track.", "Нищо не изисква действие. Текущата поддръжка е наред.")}</p>`
  return `<ul class="todo">${shown.map(item => `<li class="lv-${item.level}"><span class="lv">${escapeHtml(localize(locale, LEVEL_TEXT[item.level][0], LEVEL_TEXT[item.level][1]))}</span><span>${escapeHtml(localize(locale, item.en, item.bg))}</span><a class="btn" href="${escapeHtml(attentionHref(item.href))}">${escapeHtml(localize(locale, item.actionEn, item.actionBg))}</a></li>`).join("")}</ul>`
}

export type AvailabilityRange = "24h" | "7d" | "90d"
export const parseRange = (value: unknown): AvailabilityRange => value === "7d" || value === "90d" ? value : "24h"

export function rangeSwitch(range: AvailabilityRange, base: string, locale: StatusLocale): string {
  const names: Record<AvailabilityRange, [string, string]> = { "24h": ["24 h", "24 ч"], "7d": ["7 d", "7 дни"], "90d": ["90 d", "90 дни"] }
  return `<nav class="range" aria-label="${localize(locale, "Time range", "Период")}">${(["24h", "7d", "90d"] as const).map(id => `<a href="${base}?range=${id}"${current(id === range)}>${escapeHtml(localize(locale, names[id][0], names[id][1]))}</a>`).join("")}</nav>`
}

export function availabilityStrips(
  rows: readonly { name: string; statuses: readonly ComponentStatus[] }[],
  range: AvailabilityRange,
  locale: StatusLocale,
): string {
  const caption: Record<AvailabilityRange, [string, string, string, string]> = {
    "24h": ["24 hours ago", "Преди 24 часа", "15-minute blocks", "блокове по 15 минути"],
    "7d": ["7 days ago", "Преди 7 дни", "hourly blocks", "блокове по час"],
    "90d": ["90 days ago", "Преди 90 дни", "daily blocks", "блокове по ден"],
  }
  const known = (statuses: readonly ComponentStatus[]) => statuses.filter(status => status !== "unknown" && status !== "not-configured")
  const percent = (statuses: readonly ComponentStatus[]) => {
    const seen = known(statuses)
    if (!seen.length) return localize(locale, "no data", "няма данни")
    const lost = seen.reduce((sum, status) => sum + (status === "outage" ? 1 : status === "degraded" ? .5 : 0), 0)
    const value = 100 - lost / seen.length * 100
    return `${value === 100 ? "100" : value.toFixed(value > 99.9 ? 2 : 1)} %`
  }
  const [from, fromBg, unit, unitBg] = caption[range]
  return `<div class="avail">${rows.map(row => `<div class="avail-row"><div class="avail-name"><span>${escapeHtml(row.name)}</span><b>${escapeHtml(percent(row.statuses))}</b></div><div class="strip" style="--n:${row.statuses.length}" role="img" aria-label="${escapeHtml(row.name)}: ${escapeHtml(percent(row.statuses))}">${row.statuses.map(status => `<i class="${DOT[status] ?? "off"}"></i>`).join("")}</div></div>`).join("")}<div class="axis" aria-hidden="true"><span>${localize(locale, from, fromBg)}</span><span>${localize(locale, unit, unitBg)}</span><span>${localize(locale, "now", "сега")}</span></div></div>`
}

type MapNode = { href: string; x: number; y: number; en: string; bg: string; sub: string; state: "good" | "warn" | "bad" | "off" }

function relative(iso: string | null, now: number, locale: StatusLocale): string {
  if (!iso) return localize(locale, "nothing received yet", "още нищо не е получено")
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (minutes < 60) return localize(locale, `last data ${minutes} min ago`, `данни преди ${minutes} мин`)
  const hours = Math.round(minutes / 60)
  if (hours < 48) return localize(locale, `last data ${hours} h ago`, `данни преди ${hours} ч`)
  return localize(locale, `last data ${Math.round(hours / 24)} days ago`, `данни преди ${Math.round(hours / 24)} дни`)
}

export function overviewMap(data: DashboardData, attention: readonly AttentionItem[], locale: StatusLocale, now: number): string {
  const ids = new Set(attention.filter(item => item.level !== "note").map(item => item.id))
  const byId = new Map(data.components.map(item => [item.component, item]))
  const snapshot = data.snapshot
  const clinical = ["web", "pwa", "api", "database", "proxy"].map(id => byId.get(id)).filter((item): item is ComponentView => Boolean(item))
  const worst = clinical.some(item => item.status === "outage") ? "bad" : clinical.some(item => item.status === "degraded") ? "warn" : clinical.length && clinical.every(item => item.status === "operational") ? "good" : "off"
  const central = byId.get("central")
  const users = snapshot?.activity
  const ehr = snapshot?.integrations?.ehr
  const ai = snapshot?.integrations?.ai
  const nodes: MapNode[] = [
    { href: "/status/accounts", x: 120, y: 70, en: "Phones and computers", bg: "Телефони и компютри", sub: users ? localize(locale, `${users.activeUsers} using it now`, `${users.activeUsers} го използват сега`) : localize(locale, "no data yet", "още няма данни"), state: users ? "good" : "off" },
    { href: "/status/control/ehr", x: 520, y: 70, en: "Hospital system", bg: "Болнична система", sub: ehr ? (ehr.configured ? relative(ehr.lastReceivedAt, now, locale) : localize(locale, "not set up", "не е настроена")) : localize(locale, "no data yet", "още няма данни"), state: ehr?.configured ? "good" : "off" },
    { href: "/status/control/central", x: 545, y: 205, en: "LOSPOR Central", bg: "LOSPOR Central", sub: central ? (central.status === "not-configured" ? localize(locale, "not set up", "не е настроен") : localize(locale, `${snapshot?.central.casesWithUnacceptedChanges ?? 0} waiting`, `${snapshot?.central.casesWithUnacceptedChanges ?? 0} чакат`)) : localize(locale, "no data yet", "още няма данни"), state: (DOT[central?.status ?? "unknown"] ?? "off") as MapNode["state"] },
    { href: "/status/control/ai", x: 480, y: 320, en: "Mistral AI (EU)", bg: "Mistral AI (ЕС)", sub: ai ? (ai.enabled ? localize(locale, "switched on", "включен") : localize(locale, "switched off", "изключен")) : localize(locale, "no data yet", "още няма данни"), state: ai?.enabled ? "good" : "off" },
    { href: "/status/maintenance/backups", x: 145, y: 320, en: "Backups", bg: "Резервни копия", sub: ids.has("backup") || ids.has("offhost") || ids.has("drill") ? localize(locale, "needs attention", "изисква внимание") : localize(locale, "in order", "наред"), state: ids.has("backup") ? "bad" : ids.has("offhost") || ids.has("drill") ? "warn" : "good" },
    { href: "/status/release", x: 100, y: 200, en: "Updates", bg: "Актуализации", sub: ids.has("agent") ? localize(locale, "agent not working", "агентът не работи") : attention.some(item => item.id === "release") ? localize(locale, "new release ready", "има нова версия") : localize(locale, "up to date", "актуална"), state: ids.has("agent") ? "bad" : attention.some(item => item.id === "release") ? "warn" : "good" },
  ]
  const cx = 320, cy = 190
  const wires = nodes.map((node, index) => {
    const mx = (node.x + cx) / 2 + (node.y < cy ? -30 : 30), my = (node.y + cy) / 2, d = `M${node.x} ${node.y} Q${mx} ${my} ${cx} ${cy}`
    const traffic = node.state === "good" ? `<circle class="packet" r="3.5"><animateMotion dur="${(2.2 + index * .35).toFixed(2)}s" repeatCount="indefinite" path="${d}"/></circle>` : ""
    return `<path class="wire ${node.state}" d="${d}"/>${traffic}`
  }).join("")
  const box = (node: MapNode) => `<a href="${node.href}" class="node ${node.state}"><rect x="${node.x - 86}" y="${node.y - 23}" width="172" height="46" rx="12"/><circle cx="${node.x - 71}" cy="${node.y - 6}" r="4.5"/><text x="${node.x - 61}" y="${node.y - 1}">${escapeHtml(label(locale, node))}</text><text class="sub" x="${node.x - 61}" y="${node.y + 14}">${escapeHtml(node.sub)}</text></a>`
  const core = `<a href="/status/services" class="node core ${worst}"><rect x="${cx - 96}" y="${cy - 52}" width="192" height="104" rx="18"/><text x="${cx - 80}" y="${cy - 26}" class="strong">${localize(locale, "LOSPOR appliance", "Системата LOSPOR")}</text>${[["web", "Web", "Уеб"], ["pwa", "Phone app", "Приложение"], ["api", "API", "API"], ["database", "Database", "База данни"]].map(([id, en, bg], index) => `<circle class="${DOT[byId.get(id!)?.status ?? "unknown"]}" cx="${cx - 76 + (index % 2) * 92}" cy="${cy - 2 + Math.floor(index / 2) * 22}" r="4.5"/><text class="sub" x="${cx - 66 + (index % 2) * 92}" y="${cy + 2 + Math.floor(index / 2) * 22}">${escapeHtml(localize(locale, en!, bg!))}</text>`).join("")}</a>`
  return `<svg class="map" viewBox="0 0 640 380" role="group" aria-label="${localize(locale, "Map of the appliance and its connections. Each box opens its page.", "Карта на системата и връзките ѝ. Всяко поле отваря своята страница.")}">${wires}${core}${nodes.map(box).join("")}</svg>`
}

export function usageCard(data: DashboardData, locale: StatusLocale): string {
  const activity = data.snapshot?.activity
  if (!activity) return `<section class="card pad"><h2>${localize(locale, "Using it now", "Използват го сега")}</h2><p class="empty">${localize(locale, "Not reported by this API yet.", "Още не се отчита от API.")}</p></section>`
  const days = activity.days
  const max = Math.max(4, ...days.map(day => Math.max(day.started, day.finalized)))
  const width = 300, height = 96, base = 84, step = width / Math.max(1, days.length)
  const y = (value: number) => base - value / max * (base - 6)
  const bars = days.map((day, index) => `<rect class="bar started" x="${(index * step + .5).toFixed(1)}" width="${(step / 2 - .6).toFixed(1)}" y="${y(day.started).toFixed(1)}" height="${(base - y(day.started)).toFixed(1)}" style="animation-delay:${index * 18}ms"><title>${escapeHtml(day.day)}: ${day.started}</title></rect><rect class="bar finalized" x="${(index * step + step / 2).toFixed(1)}" width="${(step / 2 - .6).toFixed(1)}" y="${y(day.finalized).toFixed(1)}" height="${(base - y(day.finalized)).toFixed(1)}" style="animation-delay:${index * 18 + 40}ms"><title>${escapeHtml(day.day)}: ${day.finalized}</title></rect>`).join("")
  return `<section class="card pad"><div class="sec-head"><h2>${localize(locale, "Using it now", "Използват го сега")}</h2><span class="hint">${localize(locale, "active in the last 10 minutes", "активни през последните 10 минути")}</span></div>
    <div class="usage"><b class="big">${activity.activeUsers}</b><span>${localize(locale, `${activity.activeClinical} clinical · ${activity.activeResearch} research`, `${activity.activeClinical} клинични · ${activity.activeResearch} за изследвания`)}</span></div>
    <h3 class="minor">${localize(locale, "Cases per day, last 30 days", "Случаи на ден, последните 30 дни")}</h3>
    <svg class="cases" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${localize(locale, "Cases started and finalized per day", "Започнати и финализирани случаи на ден")}"><line x1="0" x2="${width}" y1="${base}" y2="${base}" class="axis-line"/>${bars}</svg>
    <div class="legend"><span><i class="started"></i>${localize(locale, "Started", "Започнати")}</span><span><i class="finalized"></i>${localize(locale, "Finalized", "Финализирани")}</span></div></section>`
}

export function goLiveCard(view: GoLiveView, locale: StatusLocale): string {
  const { done, total } = view.progress
  if (total > 0 && done >= total) return ""
  const next = view.nextStep
  return `<section class="card pad"><div class="sec-head"><h2>${localize(locale, "Going live", "Пускане в работа")}</h2><a href="/status/go-live">${localize(locale, "Open", "Отваряне")}</a></div><div class="progress" role="img" aria-label="${done} / ${total}"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div><p class="hint">${localize(locale, `${done} of ${total} steps done.`, `${done} от ${total} стъпки са готови.`)}${next ? ` ${localize(locale, "Next:", "Следва:")} ${escapeHtml(localize(locale, next.en, next.bg))}` : ""}</p></section>`
}

export function verdictCard(className: string, text: string, todayCount: number, checked: string, locale: StatusLocale): string {
  const dot = className === "good" ? "good" : className === "bad" ? "bad" : className === "warn" ? "warn" : "off"
  const todo = todayCount === 0
    ? localize(locale, "Nothing to do today.", "Днес няма задачи.")
    : localize(locale, `${todayCount} thing(s) to do today.`, `Задачи за днес: ${todayCount}.`)
  return `<section class="verdict ${dot}" role="status"><span class="state-dot ${dot}" aria-hidden="true"></span><div><strong>${escapeHtml(text)}</strong><span>${escapeHtml(todo)} ${localize(locale, "Checked", "Проверено")} ${escapeHtml(checked)} UTC.</span></div></section>`
}

export function configureBody(audience: StatusAudience, locale: StatusLocale): string {
  return visibleGroups(audience).filter(group => !["overview", "services"].includes(group.id)).map(group => `<section class="section"><h2>${escapeHtml(label(locale, group))}</h2><div class="tiles">${group.items.map(item => `<a class="tile" href="${item.path}"><b>${escapeHtml(label(locale, item))}</b><small>${escapeHtml(locale === "bg" ? item.descBg : item.descEn)}</small></a>`).join("")}</div></section>`).join("")
}

// ── colour and layout ────────────────────────────────────────────────────────

const LEGACY_DARK = `--ink:#ecebe4;--muted:#a6a499;--line:#36372f;--paper:#141511;--card:#1d1e1a;--good:#4cc283;--warn:#e3a54a;--bad:#ef6f78;--unknown:#9b998f;--info:#7fb0ea;--field:#24251f;--field-line:#55564c;--btn-bg:#ecebe4;--btn-fg:#141511;--error-bg:#3a1d20;--error-fg:#ffc9cd;--notice-bg:#17311f;--notice-fg:#bfeccd;--day-good:#2f8a57;--day-warn:#b07a2c;--day-bad:#b04a52;--day-off:#3d3e37;color-scheme:dark`
const SKIN_LIGHT = `--ink:#1a1f2b;--muted:#5f6779;--line:#dde2ec;--paper:#f3f5f9;--card:#ffffff;--sunk:#eef1f6;--good:#13875a;--warn:#b86e00;--bad:#cd2f3c;--unknown:#8a91a3;--info:#3a5bd9;--accent:#3a5bd9;--accent-fg:#ffffff;--good-s:#e3f4ec;--warn-s:#fbf0de;--bad-s:#fbe5e7;--off-s:#eceff5;--node:#ffffff;--wire:#c3cbdb;--glow:#e8edfb;--field:#f7f8fb;--field-line:#cfd5e2;--btn-bg:#3a5bd9;--btn-fg:#ffffff;--error-bg:#fbe5e7;--error-fg:#8a1d27;--notice-bg:#e3f4ec;--notice-fg:#0d5c3d;--day-good:#5fbf8f;--day-warn:#e7ad54;--day-bad:#e0707a;--day-off:#dde2ec`
const SKIN_DARK = `--ink:#e6eaf4;--muted:#8f97ab;--line:#232a3b;--paper:#0b0e16;--card:#121725;--sunk:#0f1320;--good:#3ddc97;--warn:#ffb547;--bad:#ff6b78;--unknown:#6f7890;--info:#8ea8ff;--accent:#8ea8ff;--accent-fg:#0b0e16;--good-s:#132a22;--warn-s:#2e2412;--bad-s:#321a20;--off-s:#1a1f2e;--node:#171e30;--wire:#2c3550;--glow:#1a2240;--field:#0f1320;--field-line:#2c3550;--btn-bg:#8ea8ff;--btn-fg:#0b0e16;--error-bg:#321a20;--error-fg:#ffc2c8;--notice-bg:#132a22;--notice-fg:#b4f0d2;--day-good:#2a9e6c;--day-warn:#b9852f;--day-bad:#b44a55;--day-off:#232a3b;color-scheme:dark`

/** Dark colours for the legacy skin, and the tokens the old fixed colours now use. */
export const THEME_STYLE = `
:root{--field:#fff;--field-line:#aaa89f;--btn-bg:var(--ink);--btn-fg:#fff;--error-bg:#fff0f0;--error-fg:#711b22;--notice-bg:#effaf4;--notice-fg:#185735;--day-good:#69bd8d;--day-warn:#e9b361;--day-bad:#dd747b;--day-off:#d7d5ce}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${LEGACY_DARK}}}
:root[data-theme="dark"]{${LEGACY_DARK}}
input,select,textarea{background:var(--field);border-color:var(--field-line);color:var(--ink)}
button{background:var(--btn-bg);color:var(--btn-fg)}
.logout button,.language button,.preop-drag-handle{background:transparent;color:var(--ink)}
.language button[aria-pressed=true],.language-links a[aria-current=true]{background:var(--ink);color:var(--paper)}
button.danger{background:var(--bad);color:#fff}
.error{background:var(--error-bg);color:var(--error-fg)}
.notice{background:var(--notice-bg);color:var(--notice-fg)}
.day{background:var(--day-off)}.day.operational{background:var(--day-good)}.day.degraded{background:var(--day-warn)}.day.outage{background:var(--day-bad)}.day.unknown,.day.not-configured{background:var(--day-off)}
.secret-card{background:var(--card)}
.legacy-prefs{font-size:.85rem;color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:.4rem .7rem}
.legacy-prefs:hover{color:var(--ink)}
`

/** Display settings, loaded under every skin so legacy can always switch back. */
export const PREFS_STYLE = `
.choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.choices.compact{grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}
.choice{display:flex;gap:.7rem;align-items:flex-start;margin:0;font-weight:500;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.75rem .85rem;cursor:pointer}
.choice.on,.choice:has(input:checked){border-color:var(--accent,var(--info));box-shadow:0 0 0 1px var(--accent,var(--info))}
.choice input{width:auto;margin:.2rem 0 0;flex:none}
.choice small{display:block;color:var(--muted);font-size:.8rem}
.legacy-h{font-size:.85rem;color:var(--muted);margin:1rem 0 .5rem}
.thumb{display:grid;grid-template-columns:1fr 2fr;grid-template-rows:6px 1fr;gap:3px;width:54px;height:40px;flex:none;border:1px solid var(--line);border-radius:6px;padding:3px;background:var(--sunk,var(--paper))}
.thumb i{background:var(--line);border-radius:2px}.thumb i:first-child{grid-column:1/-1;background:var(--accent,var(--info))}
.thumb-sidebar{grid-template-columns:1fr 3fr;grid-template-rows:1fr}.thumb-sidebar i:first-child{grid-column:auto}
.thumb-inbox i:nth-child(2){background:var(--warn)}
.thumb-index{grid-template-columns:2fr 3fr;grid-template-rows:1fr}.thumb-index i:first-child{grid-column:auto;background:var(--line)}
.thumb-console{grid-template-columns:3fr 1fr}
.thumb-legacy{background:#f7f6f2;border-color:#deddd6}.thumb-legacy i:first-child{background:#252521}
`

/** Everything the five new skins share, then what sets each apart. */
export const SKIN_STYLE = `
:root[data-skin]:not([data-skin="legacy"]){${SKIN_LIGHT};font:15px/1.5 ui-rounded,"SF Pro Rounded","Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif}
@media (prefers-color-scheme:dark){:root[data-skin]:not([data-skin="legacy"]):not([data-theme="light"]){${SKIN_DARK}}}
:root[data-skin]:not([data-skin="legacy"])[data-theme="dark"]{${SKIN_DARK}}
:root:not([data-skin="legacy"]) body{background:var(--paper);color:var(--ink)}
:root:not([data-skin="legacy"]) .shell{width:min(1240px,calc(100% - 2rem))}
:root:not([data-skin="legacy"]) a{color:var(--accent)}
:root:not([data-skin="legacy"]) .subnav{display:none}
.skin-head{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem 1rem;padding:1rem 0 .7rem}
.skin-head .brand{font-weight:780;color:var(--ink);text-decoration:none;font-size:1.05rem;margin-right:.4rem}
.skin-title{margin:.6rem 0 .2rem}
.skin-title h1{font-size:1.45rem;letter-spacing:-.01em;margin:0}
.skin-title p{margin:.2rem 0 0;color:var(--muted);max-width:75ch}
.skin-title .crumb{font-size:.78rem;color:var(--muted);font-weight:650}
.profile{position:relative;margin-left:auto}
.profile summary{list-style:none;cursor:pointer;display:flex;align-items:center}
.profile summary::-webkit-details-marker{display:none}
.avatar{width:2.2rem;height:2.2rem;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--accent-fg);font-weight:750;font-size:.8rem}
.profile-menu{position:absolute;right:0;top:calc(100% + .4rem);z-index:20;min-width:240px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.6rem;display:grid;gap:.5rem;box-shadow:0 12px 32px rgba(0,0,0,.18)}
.profile-menu .who{font-size:.8rem;color:var(--muted);padding:.2rem .3rem}
.profile-menu > a{padding:.45rem .5rem;border-radius:9px;text-decoration:none;color:var(--ink);font-weight:600}
.profile-menu > a:hover{background:var(--sunk)}
.profile-menu .language{display:flex;flex-wrap:wrap;gap:.3rem;padding:0 .3rem}
.profile-menu .logout button{width:100%}
:root:not([data-skin="legacy"]) .section{margin:1.1rem 0}
:root:not([data-skin="legacy"]) .section h2{font-size:1rem}
:root:not([data-skin="legacy"]) .card{border-radius:16px;background:var(--card);border-color:var(--line)}
:root:not([data-skin="legacy"]) .component{padding:.8rem 1rem}
:root:not([data-skin="legacy"]) .banner{color:var(--ink);background:var(--good-s);border:1px solid var(--line)}
:root:not([data-skin="legacy"]) .banner.warn{background:var(--warn-s)}:root:not([data-skin="legacy"]) .banner.bad{background:var(--bad-s)}:root:not([data-skin="legacy"]) .banner.unknown{background:var(--off-s)}
:root:not([data-skin="legacy"]) .facts{display:grid;grid-template-columns:1fr;gap:0;padding:.3rem 1rem}
:root:not([data-skin="legacy"]) .fact{border:0;border-top:1px solid var(--line);border-radius:0;padding:.55rem 0;display:grid;grid-template-columns:minmax(9rem,13rem) minmax(0,1fr);gap:1rem;overflow-wrap:anywhere}
:root:not([data-skin="legacy"]) .fact:first-child{border-top:0}
:root:not([data-skin="legacy"]) .fact b{display:block;text-transform:none;letter-spacing:0;font-size:.86rem;font-weight:600;color:var(--muted)}
@media(max-width:620px){:root:not([data-skin="legacy"]) .fact{grid-template-columns:1fr;gap:.1rem}}
:root:not([data-skin="legacy"]) button{border-radius:10px;font-weight:650}
:root:not([data-skin="legacy"]) input,:root:not([data-skin="legacy"]) select,:root:not([data-skin="legacy"]) textarea{border-radius:10px}
:root:not([data-skin="legacy"]) .history{height:1.1rem}
.pad{padding:1rem 1.1rem}
.rows{list-style:none;margin:0;padding:0}
.sec-head{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem;flex-wrap:wrap;margin-bottom:.4rem}
.sec-head h2{margin:0;font-size:1rem}
.hint{color:var(--muted);font-size:.82rem}
.minor{font-size:.8rem;color:var(--muted);margin:.9rem 0 .2rem;font-weight:650}
.verdict{display:flex;gap:.8rem;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:.9rem 1.1rem;margin:.6rem 0 1rem}
.verdict strong{display:block;font-size:1.08rem}
.verdict span{color:var(--muted);font-size:.88rem}
.state-dot{width:.75rem;height:.75rem;border-radius:50%;margin-top:.45rem;flex:none;background:var(--unknown)}
.state-dot.good{background:var(--good);box-shadow:0 0 0 4px var(--good-s)}.state-dot.warn{background:var(--warn);box-shadow:0 0 0 4px var(--warn-s)}.state-dot.bad{background:var(--bad);box-shadow:0 0 0 4px var(--bad-s)}
.overview{margin-top:14px;display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr);gap:14px;align-items:start}
.overview > .stack{display:grid;gap:14px}
@media(max-width:900px){.overview{grid-template-columns:1fr}}
.map{display:block;width:100%;height:auto}
.map .wire{fill:none;stroke:var(--wire);stroke-width:2}
.map .wire.warn{stroke:var(--warn);stroke-dasharray:6 5}.map .wire.bad{stroke:var(--bad);stroke-dasharray:6 5}.map .wire.off{stroke-dasharray:2 6}
.map .packet{fill:var(--good)}
.map .node rect{fill:var(--node);stroke:var(--line);stroke-width:1.5}
.map .node:hover rect,.map .node:focus rect{stroke:var(--accent);stroke-width:2}
.map .node.core rect{fill:var(--glow);stroke:var(--accent)}
.map .node text{fill:var(--ink);font-size:12.5px;font-family:inherit}
.map .node .sub{fill:var(--muted);font-size:10.5px}.map .node .strong{font-weight:700}
.map .node circle,.map circle.good{fill:var(--good)}.map .node.warn > circle,.map circle.warn{fill:var(--warn)}.map .node.bad > circle,.map circle.bad{fill:var(--bad)}.map .node.off > circle,.map circle.off{fill:var(--unknown)}
.usage{display:flex;align-items:flex-end;gap:1rem;flex-wrap:wrap}
.usage .big{font-size:2.6rem;line-height:1;font-variant-numeric:tabular-nums}
.usage span{color:var(--muted);font-size:.86rem}
.cases{display:block;width:100%;height:96px}
.cases .axis-line{stroke:var(--line)}
.cases .bar{transform-box:fill-box;transform-origin:50% 100%;animation:grow .7s cubic-bezier(.2,.8,.2,1) both}
.cases .started,.legend .started{fill:var(--accent);background:var(--accent)}.cases .finalized,.legend .finalized{fill:var(--good);background:var(--good)}
.legend{display:flex;gap:1rem;font-size:.76rem;color:var(--muted);margin-top:.3rem}
.legend i{display:inline-block;width:.6rem;height:.6rem;border-radius:2px;margin-right:.3rem}
.todo{list-style:none;margin:0;padding:0}
.todo li{display:grid;grid-template-columns:4.2rem minmax(0,1fr) auto;gap:.3rem .7rem;align-items:center;padding:.55rem 0;border-top:1px solid var(--line);font-size:.9rem}
.todo li:first-child{border-top:0}
.todo .lv{font-size:.68rem;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.todo .lv-now .lv{color:var(--bad)}.todo .lv-today .lv{color:var(--warn)}.todo .lv-soon .lv{color:var(--info)}
@media(max-width:620px){.todo li{grid-template-columns:4.2rem minmax(0,1fr)}.todo .btn{grid-column:2;justify-self:start}}
.btn{display:inline-flex;align-items:center;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:.32rem .7rem;font-size:.84rem;font-weight:650;text-decoration:none;white-space:nowrap}
.btn:hover{border-color:var(--accent)}
.progress{height:8px;border-radius:999px;background:var(--sunk);overflow:hidden;margin:.4rem 0}
.progress i{display:block;height:100%;background:var(--good);border-radius:999px}
.range{display:inline-flex;gap:2px;border-radius:999px;padding:2px;background:var(--sunk);border:1px solid var(--line)}
.range a{padding:.15rem .65rem;border-radius:999px;font-size:.8rem;color:var(--muted);text-decoration:none}
.range a[aria-current=page]{background:var(--card);color:var(--ink);font-weight:650}
.avail{display:grid;gap:.6rem}
.avail-name{display:flex;justify-content:space-between;gap:.6rem;font-size:.86rem}
.avail-name b{font-variant-numeric:tabular-nums}
.strip{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:1px;height:16px;border-radius:6px;overflow:hidden;position:relative}
.strip i{background:var(--day-good)}.strip i.warn{background:var(--day-warn)}.strip i.bad{background:var(--day-bad)}.strip i.off{background:var(--day-off)}
.strip::after{content:"";position:absolute;inset:0;background:var(--card);transform-origin:100% 50%;animation:sweep 1s cubic-bezier(.5,0,.2,1) both}
.axis{display:flex;justify-content:space-between;font-size:.72rem;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.tile{display:grid;gap:.15rem;text-decoration:none;color:var(--ink)!important;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.8rem .95rem}
.tile:hover{border-color:var(--accent)}
.tile small{color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.1rem 0 .2rem}
.chips a{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:.25rem .8rem;font-size:.84rem;text-decoration:none;color:var(--ink)}
.chips a[aria-current=page]{border-color:var(--accent);color:var(--accent);background:var(--glow);font-weight:650}
@keyframes grow{from{transform:scaleY(0)}}
@keyframes sweep{to{transform:scaleX(0)}}
@media(prefers-reduced-motion:reduce){.cases .bar,.strip::after{animation:none}.strip::after{display:none}.map .packet{display:none}}

/* map hub */
.tabs{display:flex;flex-wrap:wrap;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:3px}
.tabs a{border-radius:999px;padding:.28rem .85rem;font-size:.88rem;text-decoration:none;color:var(--muted)}
.tabs a[aria-current=page]{background:var(--accent);color:var(--accent-fg);font-weight:650}

/* sidebar, inbox, index: navigation on the left */
:root[data-skin="sidebar"] .shell:has(> .skin-nav),:root[data-skin="inbox"] .shell:has(> .skin-nav),:root[data-skin="index"] .shell:has(> .skin-nav){display:grid;grid-template-columns:250px minmax(0,1fr);column-gap:22px;grid-template-areas:"head head" "nav chips" "nav title" "nav main" "nav foot";align-items:start}
.shell > .skin-head{grid-area:head}.shell > .skin-nav{grid-area:nav}.shell > .chips{grid-area:chips}.shell > .skin-title{grid-area:title}.shell > main{grid-area:main;min-width:0}.shell > .foot{grid-area:foot}
.skin-nav{position:sticky;top:.8rem;display:grid;gap:2px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:.6rem;max-height:calc(100vh - 1.6rem);overflow:auto}
.nav-group{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:.7rem .5rem .2rem}
.nav-item{display:block;padding:.4rem .55rem;border-radius:9px;text-decoration:none;color:var(--ink)!important;font-size:.9rem}
.nav-item:hover{background:var(--sunk)}
.nav-item[aria-current=page]{background:var(--glow);color:var(--accent)!important;font-weight:650}
.nav-item small{display:block;color:var(--muted);font-size:.76rem;font-weight:400}
.rail .nav-item{padding:.6rem .7rem}
.index .search input{margin:0 0 .3rem;font-size:.9rem;padding:.5rem .7rem}
@media(max-width:860px){:root[data-skin="sidebar"] .shell:has(> .skin-nav),:root[data-skin="inbox"] .shell:has(> .skin-nav),:root[data-skin="index"] .shell:has(> .skin-nav){grid-template-columns:1fr;grid-template-areas:"head" "nav" "chips" "title" "main" "foot"}.skin-nav{position:static;max-height:none}}

/* console */
:root[data-skin="console"] .shell{width:min(1400px,calc(100% - 2rem))}
:root[data-skin="console"] .skin-head{border-bottom:1px solid var(--line)}
.menus{display:flex;flex-wrap:wrap;gap:2px;align-items:center}
.menu{position:relative}
.menu summary,.menu-top{list-style:none;cursor:pointer;padding:.38rem .7rem;border-radius:8px;font-size:.9rem;color:var(--ink);text-decoration:none;display:inline-block}
.menu summary::-webkit-details-marker{display:none}
.menu summary::after{content:" ▾";color:var(--muted)}
.menu summary.on,.menu-top[aria-current=page]{background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.12);font-weight:650}
.menu-list{position:absolute;top:100%;left:0;z-index:20;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.35rem;min-width:240px;display:grid;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.menu-list a{padding:.42rem .6rem;border-radius:8px;text-decoration:none;color:var(--ink)}
.menu-list a:hover{background:var(--sunk)}.menu-list a[aria-current=page]{color:var(--accent);font-weight:650}
:root[data-skin="console"] .component{padding:.55rem .8rem}
:root[data-skin="console"] .section{margin:.8rem 0}
@media print{.skin-head,.skin-nav,.chips,.profile{display:none!important}}
`
