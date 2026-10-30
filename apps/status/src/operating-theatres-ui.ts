import { ControlPlaneClientError, type OperatingTheatresChange, type OperatingTheatresView } from "./control-plane.js"
import { localize, type StatusLocale } from "./locale.js"
import { escapeHtml } from "./util.js"

/**
 * The operating theatres page (10.0.0). Off by default and nothing bundled:
 * the site switches them on and names its own. Clinicians then assign a
 * theatre from the dashboard until intraop starts; a case keeps the name its
 * theatre had when it started. Plain HTML forms that work without JavaScript.
 */

export const THEATRES_PATH = "/status/control/theatres"
const ACTION_PATH = "/status/control/operating-theatres"
const ANCHOR = "operating-theatres"

const LIST_ACTIONS = ["add", "rename", "retire", "restore", "move"] as const

const field = (body: Record<string, unknown>, name: string, max: number): string => {
  const value = body[name]
  if (typeof value !== "string" || value.trim() === "" || value.length > max) throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
  return value.trim()
}

/** A list form's change (add, rename, retire, restore, move). Throws for one it cannot be. */
export function theatreListChangeFromForm(body: Record<string, unknown>): OperatingTheatresChange {
  const action = body.action
  if (!(LIST_ACTIONS as readonly unknown[]).includes(action)) throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
  switch (action as typeof LIST_ACTIONS[number]) {
    case "add": return { action: "add", name: field(body, "name", 200) }
    case "rename": return { action: "rename", id: field(body, "id", 64), name: field(body, "name", 200) }
    case "retire": return { action: "retire", id: field(body, "id", 64) }
    case "restore": return { action: "restore", id: field(body, "id", 64) }
    case "move": {
      const direction = body.direction === "up" ? "up" : body.direction === "down" ? "down" : null
      if (!direction) throw new ControlPlaneClientError("INVALID_CONTROL_REQUEST")
      return { action: "move", id: field(body, "id", 64), direction }
    }
  }
}

function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`
}

function smallForm(action: string, id: string, label: string, extra = "", className = ""): string {
  return `<form class="ot-inline" method="post" action="${ACTION_PATH}#${ANCHOR}">${hidden("action", action)}${hidden("id", id)}${extra}<button type="submit" class="ot-small${className ? ` ${className}` : ""}">${label}</button></form>`
}

/** Hospital control · Operating theatres. */
export function renderOperatingTheatresPage(view: OperatingTheatresView | null | undefined, locale: StatusLocale): string {
  const intro = `<p>${localize(locale,
    "Which operating theatre a case is in. Off by default, and there are no bundled names: switch it on and add your own. Clinicians assign a theatre from the dashboard — on the web beside “Assign to”, on the phone by holding a case — and can change it until intraop starts. A case then keeps the name its theatre had when it started, so renaming or retiring a theatre here does not rewrite earlier cases. The theatre is printed on the record and left out of every research export.",
    "В коя операционна зала е случаят. По подразбиране е изключено и няма вградени имена: включете го и добавете своите. Лекарите задават залата от таблото — в уеб до „Назначи на“, на телефона със задържане върху случая — и могат да я сменят до началото на интраоперативния етап. След това случаят запазва името, което залата е имала при началото, така че преименуване или премахване на зала тук не променя по-ранните случаи. Залата се отпечатва в протокола и не влиза в нито един изследователски износ.")}</p>`
  const title = ""
  if (!view) {
    return `<div class="component" id="${ANCHOR}">${title}${intro}<div class="empty">${localize(locale, "This API does not offer the operating theatres yet.", "Този API още не предлага операционните зали.")}</div></div>`
  }
  const active = view.theatres.filter(theatre => theatre.active).sort((left, right) => left.sortOrder - right.sortOrder)
  const retired = view.theatres.filter(theatre => !theatre.active)
  const cases = (count: number) => `<span class="component-detail">${count} ${localize(locale, count === 1 ? "case" : "cases", count === 1 ? "случай" : "случая")}</span>`

  const policy = `<form method="post" action="${ACTION_PATH}/policy#${ANCHOR}" data-testid="theatres-policy"><label class="check"><input type="checkbox" name="enabled" value="true"${view.enabled ? " checked" : ""}> ${localize(locale, "Assign operating theatres to cases", "Задаване на операционна зала на случаите")}</label><p class="component-detail">${view.enabled
    ? localize(locale, "On: clinicians see the theatre on the dashboard, in each case and on the printed record.", "Включено: лекарите виждат залата в таблото, във всеки случай и в отпечатания протокол.")
    : localize(locale, "Off: the apps show no theatre anywhere. Theatres added below are kept for when it is switched on.", "Изключено: приложенията не показват зала никъде. Добавените по-долу зали се пазят, докато не бъде включено.")}</p><label>${localize(locale, "Reason for the change", "Причина за промяната")}<input name="reason" minlength="10" maxlength="1000" required></label><label>${localize(locale, "Administrator password", "Администраторска парола")}<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label><button type="submit">${localize(locale, "Save the switch", "Запазване на настройката")}</button></form>`

  const add = `<form class="ot-add" method="post" action="${ACTION_PATH}#${ANCHOR}" data-testid="theatres-add">${hidden("action", "add")}<label>${localize(locale, "New theatre", "Нова зала")}<input name="name" maxlength="60" required placeholder="${localize(locale, "e.g. Theatre 3", "напр. Зала 3")}"></label><button type="submit">${localize(locale, "Add", "Добавяне")}</button></form><p class="component-detail">${localize(locale, "One name, shown as written in both languages. Up to 60 characters; no two active theatres may share a name.", "Едно име, показвано както е написано и на двата езика. До 60 знака; две действащи зали не може да имат едно и също име.")}</p>`

  const rows = active.map((theatre, index) => `<li class="ot-row" data-theatre="${escapeHtml(theatre.id)}"><span class="ot-position">${index + 1}</span><form class="ot-rename" method="post" action="${ACTION_PATH}#${ANCHOR}">${hidden("action", "rename")}${hidden("id", theatre.id)}<input name="name" maxlength="60" required value="${escapeHtml(theatre.name)}" aria-label="${localize(locale, "Name", "Име")}"><button type="submit" class="ot-small">${localize(locale, "Rename", "Преименуване")}</button></form>${cases(theatre.caseCount)}<span class="ot-actions">${index > 0 ? smallForm("move", theatre.id, "↑", hidden("direction", "up")) : ""}${index < active.length - 1 ? smallForm("move", theatre.id, "↓", hidden("direction", "down")) : ""}${smallForm("retire", theatre.id, localize(locale, "Retire", "Премахване"), "", "ot-retire")}</span></li>`).join("")
  const list = active.length
    ? `<ol class="ot-list" data-testid="theatres-active">${rows}</ol>`
    : `<div class="empty">${localize(locale, "No theatres yet. Add the first one above.", "Още няма зали. Добавете първата по-горе.")}</div>`
  const retiredList = retired.length
    ? `<details class="component"><summary class="component-name">${localize(locale, "Retired theatres", "Премахнати зали")} (${retired.length})</summary><p class="component-detail">${localize(locale, "A retired theatre is no longer offered; the cases that had it keep it.", "Премахнатата зала вече не се предлага; случаите, които я имат, я запазват.")}</p><ul class="ot-list" data-testid="theatres-retired">${retired.map(theatre => `<li class="ot-row"><span class="ot-position">–</span><strong>${escapeHtml(theatre.name)}</strong>${cases(theatre.caseCount)}<span class="ot-actions">${smallForm("restore", theatre.id, localize(locale, "Restore", "Възстановяване"))}</span></li>`).join("")}</ul></details>`
    : ""

  return `<div class="component" id="${ANCHOR}">${title}${intro}${policy}</div><div class="component"><h3>${localize(locale, "The theatres", "Залите")}</h3><p class="component-detail">${localize(locale, "In the order the pickers show them. Renaming changes the name on cases that have not started yet.", "В реда, в който ги показват менютата. Преименуването сменя името на случаите, които още не са започнали.")}</p>${add}${list}</div>${retiredList}`
}

export const THEATRES_STYLE = `.ot-list{list-style:none;padding:0;margin:.8rem 0 0;display:grid;gap:.4rem}.ot-row{display:grid;grid-template-columns:2ch minmax(0,1fr) auto auto;gap:.65rem;align-items:center;border:1px solid var(--line);border-radius:9px;padding:.5rem .75rem;background:var(--card)}
.ot-position{font-variant-numeric:tabular-nums;color:var(--muted);text-align:right}.ot-rename{display:flex;gap:.45rem;align-items:center;margin:0;min-width:0}.ot-rename input{margin:0;padding:.45rem .6rem;min-width:0}
.ot-inline{display:inline;margin:0}.ot-actions{display:flex;gap:.3rem;justify-content:flex-end}button.ot-small{margin:0;padding:.4rem .6rem;font-size:.82rem;background:transparent;color:var(--ink);border:1px solid var(--line);white-space:nowrap}button.ot-retire{color:var(--bad)}
.ot-add{display:flex;gap:.6rem;align-items:flex-end;flex-wrap:wrap}.ot-add label{flex:1 1 14rem;margin-top:.4rem}.ot-add button{margin-top:0}
@media(max-width:760px){.ot-row{grid-template-columns:2ch minmax(0,1fr)}.ot-row>.component-detail,.ot-actions{grid-column:2}.ot-actions{justify-content:flex-start}}`
