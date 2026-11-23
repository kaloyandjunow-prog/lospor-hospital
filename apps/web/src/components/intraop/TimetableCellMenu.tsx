"use client"

import { PopoverClose } from "./PopoverClose"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { IntraopMenuAction } from "@lospor/core/intraop-menu"

/**
 * The one menu of the web chart (10.8.0): what can be done with the thing in a
 * cell. It always stays on the screen (never under the footer), and every
 * action is a 44 px target. The actions come from Core; this only draws them.
 */
export function TimetableCellMenu({ anchor, title, subtitle, actions, labels, onAction, onClose }: {
  anchor: DOMRect
  title: string
  subtitle?: string
  actions: IntraopMenuAction[]
  labels: Record<IntraopMenuAction, string>
  onAction: (action: IntraopMenuAction) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: anchor.left, top: anchor.bottom + 4 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    let top = anchor.bottom + 4
    if (top + height > viewportHeight - margin) top = Math.max(margin, anchor.top - height - 4)
    const left = Math.min(Math.max(margin, anchor.left), window.innerWidth - width - margin)
    setPosition({ left, top })
  }, [anchor])

  // The host re-renders often (the clock) and hands a new onClose each time: listening through a ref keeps
  // the listeners in place, so a key pressed while the host renders is not lost.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    // Closing hands the focus back to the cell the menu came from, so the arrows carry on from there.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current() }
    const onDown = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) closeRef.current() }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown, true)
      const now = document.activeElement
      if (opener?.isConnected && (!now || now === document.body || now.closest("[role=menu]"))) opener.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus() }, [])

  if (actions.length === 0) return null
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      data-testid="timetable-cell-menu"
      className="fixed z-[60] min-w-56 max-w-[min(20rem,calc(100vw-16px))] rounded-xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] shadow-xl p-1.5"
      style={{ left: position.left, top: position.top }}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-2 pb-1.5">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</div>
          {subtitle ? <div className="text-xs text-slate-500 dark:text-[#9a9a9a] truncate">{subtitle}</div> : null}
        </div>
        <PopoverClose onClose={onClose} />
      </div>
      {actions.map(action => (
        <button
          key={action}
          type="button"
          role="menuitem"
          data-testid={`cell-menu-${action}`}
          onClick={() => onAction(action)}
          onKeyDown={event => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
            event.preventDefault()
            const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])]
            const index = items.indexOf(event.currentTarget)
            items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
          }}
          className={`flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] ${action === "delete" || action === "delete_here" || action === "delete_whole" || action === "remove_planned" ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100"}`}
        >
          {labels[action]}
        </button>
      ))}
    </div>
  )
}
