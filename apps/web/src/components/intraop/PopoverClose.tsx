"use client"

import { useIntraopUiCopy } from "./ui-copy"

/**
 * The ✕ of a menu or popover on the chart (10.8.0): closing never depends on knowing that a tap outside, or Esc, does it.
 * A small round chip; on a finger it is 44 px (the touch rule in globals.css).
 */
export function PopoverClose({ onClose, className = "" }: { onClose: () => void; className?: string }) {
  const copy = useIntraopUiCopy()
  return (
    <button
      type="button"
      onClick={event => { event.stopPropagation(); onClose() }}
      aria-label={copy.close}
      title={copy.close}
      data-testid="popover-close"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold leading-none text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:bg-[#2c2c2c] dark:text-[#aaa] dark:hover:bg-[#3a3a3a] dark:hover:text-white ${className}`}
    >
      ✕
    </button>
  )
}
