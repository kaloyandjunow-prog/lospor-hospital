"use client"

import { useEffect } from "react"

/**
 * While a slider is dragged or a button is pressed and held, nothing on the
 * page may be selected: a drag that wanders off a slider, or a held "+" that
 * slides sideways, otherwise paints a text selection across the form.
 *
 * The page's CSS (globals.css) turns selection off on the controls themselves;
 * this marks the whole document for the length of the press and cancels
 * `selectstart`, which is what covers the part of the drag that leaves the control.
 */
const HELD = 'button, [role="button"], [role="slider"], [role="tab"], summary, input[type="range"]'

export function GestureGuard() {
  useEffect(() => {
    const root = document.documentElement
    let held = false
    const end = () => {
      if (!held) return
      held = false
      root.removeAttribute("data-gesture")
    }
    const start = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest(HELD)) return
      held = true
      root.setAttribute("data-gesture", "held")
    }
    const block = (event: Event) => { if (held) event.preventDefault() }
    document.addEventListener("pointerdown", start, true)
    document.addEventListener("selectstart", block)
    document.addEventListener("dragstart", block)
    window.addEventListener("pointerup", end, true)
    window.addEventListener("pointercancel", end, true)
    window.addEventListener("blur", end)
    return () => {
      document.removeEventListener("pointerdown", start, true)
      document.removeEventListener("selectstart", block)
      document.removeEventListener("dragstart", block)
      window.removeEventListener("pointerup", end, true)
      window.removeEventListener("pointercancel", end, true)
      window.removeEventListener("blur", end)
      end()
    }
  }, [])
  return null
}
