"use client"

import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { positionPopover, type AnchorRect } from "./anchored-position"

/**
 * The shell every popover on the intraop chart shares: a portal, a backdrop
 * that dismisses, and a panel positioned against the cell that opened it.
 *
 * All of it was written out at each site, roughly ten times over, each copy
 * free to drift from the others. Positioning is the part worth having in one
 * place — see ./anchored-position for why, and for its tests.
 */

export type AnchoredPopoverProps = {
  anchor: AnchorRect
  width: number
  /** Flip above the anchor when there is less room than this below it. */
  flipBelowSpace: number
  align?: "left" | "center"
  /** Panel styling; the default is the standard card. */
  className?: string
  /** Layer. Pickers sit below the dosing flyout, which sits below dialogs. */
  layer?: number
  onDismiss: () => void
  children: ReactNode
}

const DEFAULT_PANEL =
  "bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden"

export function AnchoredPopover({
  anchor,
  width,
  flipBelowSpace,
  align = "left",
  className = DEFAULT_PANEL,
  layer = 9990,
  onDismiss,
  children,
}: AnchoredPopoverProps) {
  if (typeof document === "undefined") return null

  const { left, top, showAbove } = positionPopover({
    anchor,
    width,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    flipBelowSpace,
    align,
  })

  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: layer }} onClick={onDismiss} />
      <div
        style={{
          position: "fixed",
          left,
          top,
          width,
          zIndex: layer + 1,
          transform: showAbove ? "translateY(-100%)" : undefined,
        }}
        className={className}
        onClick={event => event.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
