import type { AuditHistoryView } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"

/**
 * The Change history page (10.3.0): who changed which hospital setting or account, and when, read from the audit
 * rows. It is a page of its own, one row in the menu of every skin. Plain GET links and a filter form: no script.
 *
 * It shows what was changed, never why or to what: the audit rows keep neither (a reason an administrator gives is
 * not an audit field, and the row's detail stays in the database).
 */

export const HISTORY_PATH = "/status/control/history"

const CATEGORY_NAMES: Record<string, [string, string]> = {
  ACCOUNT: ["Accounts", "Профили"],
  CENTRAL: ["LOSPOR Central", "LOSPOR Central"],
  CLINICAL_RULES: ["Clinical rules", "Клинични правила"],
  INSTITUTION: ["Institution", "Лечебно заведение"],
  MAINTENANCE: ["Maintenance", "Поддръжка"],
  RESEARCH: ["Research access", "Достъп за изследвания"],
  SECURITY: ["Settings and security", "Настройки и сигурност"],
}

export type HistoryQuery = { page: number; category: string; action: string }

/** The query of a request, bounded: a page number, and a category and an action that are plain codes. */
export function historyQueryOf(get: (name: string) => string | undefined): HistoryQuery {
  const page = Number.parseInt(get("page") ?? "0", 10)
  const code = (value: string | undefined) => (value && /^[A-Z][A-Z0-9_]{0,80}$/.test(value) ? value : "")
  return { page: Number.isFinite(page) && page > 0 && page < 100_000 ? page : 0, category: code(get("category")), action: code(get("action")) }
}

const stamp = (value: string, locale: StatusLocale): string => {
  const time = Date.parse(value)
  return Number.isFinite(time)
    ? `${new Date(time).toLocaleString(locale === "bg" ? "bg-BG" : "en-GB", { timeZone: "UTC" })} UTC`
    : "—"
}

const link = (query: HistoryQuery, page: number): string => {
  const params = new URLSearchParams()
  if (query.category) params.set("category", query.category)
  if (query.action) params.set("action", query.action)
  if (page > 0) params.set("page", String(page))
  const text = params.toString()
  return text ? `${HISTORY_PATH}?${text}` : HISTORY_PATH
}

export function renderHistoryPage(view: AuditHistoryView | null | undefined, query: HistoryQuery, locale: StatusLocale): string {
  const heading = `<h2>${localize(locale, "Change history", "История на промените")}</h2>`
  const intro = `<p>${localize(locale,
    "Who changed which hospital setting or account, and when. It records that a setting was changed, not why or to what: a reason an administrator gave is kept apart from the audit rows, and what a setting was set to is read on its own page.",
    "Кой коя болнична настройка или кой профил е променил, и кога. Записва се, че настройка е променена, а не защо и на какво: причината, дадена от администратор, се пази отделно от одитните редове, а към какво е зададена настройката се вижда на нейната страница.")}</p>`
  if (!view) {
    return `<section class="section" data-testid="history-page">${heading}<div class="card"><div class="component">${intro}<div class="empty">${localize(locale, "This API does not report the change history yet.", "Този API още не показва историята на промените.")}</div></div></div></section>`
  }
  const categoryName = (key: string | null) => {
    const names = key ? CATEGORY_NAMES[key] : undefined
    return names ? localize(locale, names[0], names[1]) : (key ?? "")
  }
  const categoryOptions = [`<option value="">${localize(locale, "All changes", "Всички промени")}</option>`,
    ...view.categories.map(key => `<option value="${escapeHtml(key)}"${key === query.category ? " selected" : ""}>${escapeHtml(categoryName(key))}</option>`)].join("")
  const actionOptions = [`<option value="">${localize(locale, "Any kind", "Всякакъв вид")}</option>`,
    ...view.actions.filter(item => !query.category || item.category === query.category).map(item => `<option value="${escapeHtml(item.code)}"${item.code === query.action ? " selected" : ""}>${escapeHtml(locale === "bg" ? item.labelBg : item.labelEn)}</option>`)].join("")
  const filter = `<form method="get" action="${HISTORY_PATH}" class="history-filter" data-testid="history-filter"><label>${localize(locale, "Area", "Област")}<select name="category">${categoryOptions}</select></label><label>${localize(locale, "Kind of change", "Вид промяна")}<select name="action">${actionOptions}</select></label><button type="submit">${localize(locale, "Show", "Покажи")}</button></form>`

  const rows = view.rows.map(row => `<tr data-testid="history-row" data-action="${escapeHtml(row.action)}"><td>${escapeHtml(stamp(row.at, locale))}</td><td>${escapeHtml(locale === "bg" ? row.labelBg : row.labelEn)}</td><td>${row.who ? escapeHtml(row.who) : "—"}</td><td class="component-detail">${escapeHtml(categoryName(row.category))}</td></tr>`).join("")
  const table = view.rows.length === 0
    ? `<div class="empty" data-testid="history-empty">${localize(locale, "No change matches.", "Няма промяна, която да съвпада.")}</div>`
    : `<table class="history-table" data-testid="history-table"><thead><tr><th>${localize(locale, "When", "Кога")}</th><th>${localize(locale, "What changed", "Какво е променено")}</th><th>${localize(locale, "Who", "Кой")}</th><th>${localize(locale, "Area", "Област")}</th></tr></thead><tbody>${rows}</tbody></table>`

  const pages = Math.max(1, Math.ceil(view.total / view.pageSize))
  const here = Math.min(Math.max(view.page, 0), pages - 1)
  const pager = `<nav class="history-pager" aria-label="${localize(locale, "Pages", "Страници")}" data-testid="history-pager">${
    here > 0 ? `<a href="${escapeHtml(link(query, here - 1))}" rel="prev">${localize(locale, "Newer", "По-нови")}</a>` : ""}<span class="component-detail">${view.total} ${localize(locale, "changes", "промени")} · ${localize(locale, "page", "страница")} ${here + 1} / ${pages}</span>${
    here < pages - 1 ? `<a href="${escapeHtml(link(query, here + 1))}" rel="next">${localize(locale, "Older", "По-стари")}</a>` : ""}</nav>`
  return `<section class="section" data-testid="history-page">${heading}<div class="card"><div class="component">${intro}${filter}${table}${pager}</div></div></section>`
}

export const HISTORY_STYLE = `.history-filter{display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end;margin:.6rem 0}.history-filter label{display:grid;gap:.2rem}.history-table{width:100%;border-collapse:collapse;margin:.5rem 0}.history-table th,.history-table td{padding:.35rem .5rem;border-bottom:1px solid var(--line,#e2e8f0);text-align:left;vertical-align:top}.history-table td:first-child{white-space:nowrap;font-variant-numeric:tabular-nums}.history-pager{display:flex;gap:1rem;align-items:center;margin:.6rem 0}`
