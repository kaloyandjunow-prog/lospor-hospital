"use client"

import { useEffect, useRef } from "react"
import { useTimetableMenu } from "./TimetableMenuHost"
import { portalHost } from "@/lib/portal-host"

/**
 * The chart's cursor (10.8.0, rules 6): one highlighted cell, the same for a
 * mouse, a finger and a keyboard.
 *
 * - Mouse: pointing highlights the row and the cell (CSS, globals.css); a click opens the menu.
 * - Finger: the first tap highlights the cell, the second opens the menu.
 * - Keyboard: arrows move between cells, Enter opens the menu, Esc lets go,
 *   Delete removes what is in the cell (with Undo).
 *
 * Lanes mark their cells with `ttCell` / `ttPoint`; nothing else needs to know.
 */
type CellTarget = { kind: string; key: string; col: number }

/** A lane's row: put on the lane's outer element. */
export const ttLane = (name: string) => ({ "data-tt-lane": name })

/** A column cell of a lane; with a target when something runs in it (Delete then removes it). */
export function ttCell(col: number, target?: CellTarget | null) {
  return {
    "data-tt-cell": "",
    "data-tt-col": col,
    tabIndex: -1,
    ...(target ? { "data-tt-kind": target.kind, "data-tt-key": target.key } : {}),
  }
}

/** A single entry (drug, event) in a cell. */
export function ttPoint(eventId: string | undefined) {
  return eventId ? { "data-tt-point": eventId, tabIndex: -1 } : {}
}

const ROOT = "[data-intraop-chart-root]"
const CELL = "[data-tt-cell]"

function armed(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${ROOT} [data-tt-armed]`)
}

function arm(element: HTMLElement | null) {
  armed()?.removeAttribute("data-tt-armed")
  if (!element) return
  element.setAttribute("data-tt-armed", "")
  element.focus({ preventScroll: false })
}

function cellsOfLane(lane: Element): HTMLElement[] {
  return [...lane.querySelectorAll<HTMLElement>(CELL)]
}

function neighbour(cell: HTMLElement, key: string): HTMLElement | null {
  const lane = cell.closest("[data-tt-lane]")
  if (!lane) return null
  const col = Number(cell.getAttribute("data-tt-col"))
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const cells = cellsOfLane(lane)
    const index = cells.indexOf(cell)
    return cells[index + (key === "ArrowRight" ? 1 : -1)] ?? null
  }
  const lanes = [...document.querySelectorAll(`${ROOT} [data-tt-lane]`)].filter(item => cellsOfLane(item).length > 0)
  const index = lanes.indexOf(lane)
  const step = key === "ArrowDown" ? 1 : -1
  for (let i = index + step; i >= 0 && i < lanes.length; i += step) {
    const cells = cellsOfLane(lanes[i])
    const same = cells.find(item => Number(item.getAttribute("data-tt-col")) === col)
    if (same) return same
  }
  return null
}

export function ChartCursor() {
  const menu = useTimetableMenu()
  // Held in a ref: the listeners are set once, not again on every render of the chart.
  const menuRef = useRef(menu)
  useEffect(() => { menuRef.current = menu }, [menu])

  useEffect(() => {
    let touchArmedNow = false
    // The tap that armed a cell swallows only its own click, and only for a moment: a touch that became a scroll, or a click
    // elsewhere (the keyboard's Enter), is not swallowed later.
    let armedFor: HTMLElement | null = null
    let armedTimer = 0
    const disarmTap = () => { touchArmedNow = false; window.clearTimeout(armedTimer) }
    const inChart = (target: EventTarget | null): target is Element =>
      target instanceof Element && !!target.closest(ROOT)

    // A finger: the first tap only highlights; the click it makes is swallowed.
    const onPointerDown = (event: PointerEvent) => {
      touchArmedNow = false
      if (event.pointerType !== "touch" || !inChart(event.target)) return
      const target = (event.target as Element).closest<HTMLElement>(`[data-tt-point], ${CELL}`)
      if (!target || target.hasAttribute("data-tt-armed")) return
      // Inputs (the vitals grid) and the add buttons work at once.
      if ((event.target as Element).closest("input, textarea, [data-tt-direct]")) return
      arm(target)
      touchArmedNow = true
      armedFor = target
      window.clearTimeout(armedTimer)
      armedTimer = window.setTimeout(() => { touchArmedNow = false }, 700)
      const cell = target.closest<HTMLElement>(CELL)
      if (cell) showTip(cell); else hideTip()
    }
    // The full text of a cut-off bar label, above its row: shown when the pointer rests on the bar, or on the first
    // tap of a finger (the tap that only highlights); gone at the next tap, scroll, key or when the menu opens.
    let tip: HTMLDivElement | null = null
    let tipTimer = 0
    let tipCell: Element | null = null
    const hideTip = () => { window.clearTimeout(tipTimer); tipTimer = 0; tip?.remove(); tip = null }
    const showTip = (cell: HTMLElement) => {
      hideTip()
      const kind = cell.getAttribute("data-tt-kind")
      const key = cell.getAttribute("data-tt-key")
      const lane = cell.closest("[data-tt-lane]")
      if (!kind || !key || !lane) return
      const label = [...lane.querySelectorAll<HTMLElement>("[data-tt-full]")]
        .find(item => item.getAttribute("data-tt-owner") === `${kind}:${key}` && item.scrollWidth > item.clientWidth + 1)
      const text = label?.getAttribute("data-tt-full")
      if (!text) return
      tip = document.createElement("div")
      tip.className = "tt-tip"
      tip.setAttribute("role", "tooltip")
      tip.textContent = text
      portalHost().appendChild(tip)
      const at = cell.getBoundingClientRect()
      const row = lane.getBoundingClientRect()
      const box = tip.getBoundingClientRect()
      const left = Math.min(Math.max(8, at.left), Math.max(8, window.innerWidth - box.width - 8))
      const above = row.top - box.height - 6
      tip.style.left = `${left}px`
      tip.style.top = `${above >= 8 ? above : row.bottom + 6}px`
    }
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !inChart(event.target)) return
      const cell = (event.target as Element).closest<HTMLElement>(CELL)
      if (cell === tipCell) return
      scheduleTip(cell)
    }
    const scheduleTip = (cell: HTMLElement | null) => {
      tipCell = cell
      hideTip()
      if (cell) tipTimer = window.setTimeout(() => { tipTimer = 0; showTip(cell) }, 250)
    }
    // A scroll takes the tip away; the pointer, resting where it was, brings it back when it moves again.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || tip || tipTimer || !inChart(event.target)) return
      const cell = (event.target as Element).closest<HTMLElement>(CELL)
      if (cell) scheduleTip(cell)
    }
    const onLeaveChart = (event: PointerEvent) => { if (event.pointerType === "mouse" && !inChart(event.relatedTarget)) { tipCell = null; hideTip() } }
    const onClick = (event: MouseEvent) => {
      const swallow = touchArmedNow && !!armedFor && event.target instanceof Node && armedFor.contains(event.target)
      disarmTap()
      if (!swallow) { hideTip(); return }
      event.preventDefault()
      event.stopPropagation()
    }

    // Ctrl+Z / Ctrl+Y: the menu's history when it changed last, else the chart's own handler runs (10.8.0).
    const onUndoKeys = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      const wantsUndo = key === "z" && !event.shiftKey
      const wantsRedo = key === "y" || (key === "z" && event.shiftKey)
      if (!wantsUndo && !wantsRedo) return
      const target = event.target as Element | null
      if (target?.closest?.("input, textarea, [contenteditable=true]")) return
      const api = menuRef.current
      if (!api) return
      const menuNewer = api.history.lastAt > (api.facts.chartChangedAt ?? 0)
      const handled = wantsUndo
        ? api.history.canUndo && menuNewer && api.history.undo()
        : api.history.canRedo && menuNewer && api.history.redo()
      if (handled) { event.preventDefault(); event.stopPropagation() }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      hideTip()
      const active = document.activeElement as HTMLElement | null
      if (!active || !inChart(active)) return
      if (active.closest("input, textarea, select, [role=dialog], [role=menu]")) return
      const cell = active.closest<HTMLElement>(`[data-tt-point], ${CELL}`)
      if (!cell) return
      if (event.key.startsWith("Arrow")) {
        const from = cell.hasAttribute("data-tt-cell") ? cell : cell.closest<HTMLElement>(CELL)
        const next = from ? neighbour(from, event.key) : null
        if (next) { event.preventDefault(); arm(next); next.scrollIntoView({ block: "nearest", inline: "nearest" }) }
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        cell.click()
      } else if (event.key === "Escape") {
        arm(null)
      } else if ((event.key === "Delete" || event.key === "Backspace") && menuRef.current) {
        const point = cell.getAttribute("data-tt-point")
        const kind = cell.getAttribute("data-tt-kind")
        const key = cell.getAttribute("data-tt-key")
        if (point) { event.preventDefault(); menuRef.current.deleteAt({ eventId: point }) }
        else if (kind && key) { event.preventDefault(); menuRef.current.deleteAt({ kind, key, col: Number(cell.getAttribute("data-tt-col")) }) }
      }
    }
    // Focus by mouse or Tab highlights too, so the keyboard can carry on from there.
    const onFocusIn = (event: FocusEvent) => {
      if (!inChart(event.target)) return
      const cell = (event.target as Element).closest<HTMLElement>(`[data-tt-point], ${CELL}`)
      if (cell && !cell.hasAttribute("data-tt-armed")) { armed()?.removeAttribute("data-tt-armed"); cell.setAttribute("data-tt-armed", "") }
    }

    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("pointerover", onPointerOver)
    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerout", onLeaveChart)
    window.addEventListener("scroll", hideTip, true)
    window.addEventListener("scroll", disarmTap, true)
    document.addEventListener("pointercancel", disarmTap, true)
    document.addEventListener("click", onClick, true)
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("keydown", onUndoKeys, true)
    document.addEventListener("focusin", onFocusIn)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("pointerover", onPointerOver)
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerout", onLeaveChart)
      window.removeEventListener("scroll", hideTip, true)
      window.removeEventListener("scroll", disarmTap, true)
      document.removeEventListener("pointercancel", disarmTap, true)
      window.clearTimeout(armedTimer)
      hideTip()
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("keydown", onUndoKeys, true)
      document.removeEventListener("focusin", onFocusIn)
    }
  }, [])

  return null
}
