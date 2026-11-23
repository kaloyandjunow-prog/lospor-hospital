"use client"
import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useLocale } from "next-intl"
import { formatClockTime, type ClockTime } from "@lospor/core/time-entry"
import { TimeWheel } from "@/components/time/TimeWheel"
import { TIMETABLE_MENU_COPY } from "@/components/intraop/timetable-menu-copy"
import { useIntraopUiCopy } from "@/components/intraop/ui-copy"

/**
 * The intraop form's start and end time (10.8.0): a 44 px field that opens the
 * shared time wheel -- the same wheel as the chart's menus and the PWA, with
 * typing (1024 becomes 10:24) -- instead of two native hour and minute lists.
 * It opens on the field's own time, or on now when it is empty.
 */
function clockOf(value: string | undefined): ClockTime {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "")
  if (match) return { hour: Number(match[1]), minute: Number(match[2]) }
  const now = new Date()
  return { hour: now.getHours(), minute: now.getMinutes() }
}

export const TimePicker = React.forwardRef<HTMLButtonElement, { value?: string; onChange: (v: string) => void }>(
  function TimePicker({ value, onChange }, ref) {
    const uiCopy = useIntraopUiCopy()
    const locale = useLocale()
    const copy = TIMETABLE_MENU_COPY[locale === "bg" ? "bg" : "en"]
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<ClockTime>(() => clockOf(value))
    const box = useRef<HTMLDivElement | null>(null)
    const panel = useRef<HTMLDivElement | null>(null)
    const [up, setUp] = useState(false)

    useLayoutEffect(() => {
      if (!open || !panel.current) return
      setUp(panel.current.getBoundingClientRect().bottom > (window.visualViewport?.height ?? window.innerHeight) - 8)
    }, [open])
    useEffect(() => {
      if (!open) return
      const close = (event: PointerEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false) }
      window.addEventListener("pointerdown", close, true)
      return () => window.removeEventListener("pointerdown", close, true)
    }, [open])

    return (
      <div ref={box} className="relative inline-block">
        <button
          ref={ref}
          type="button"
          data-testid="time-picker"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setDraft(clockOf(value)); setOpen(current => !current) }}
          className="flex h-11 min-w-[6.5rem] items-center justify-center rounded-lg border border-input bg-background px-3 font-mono text-base tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {value || `${uiCopy.hourPlaceholder}:${uiCopy.minutePlaceholder}`}
        </button>
        {open ? (
          <div ref={panel} role="dialog" className={`absolute left-0 z-50 w-64 rounded-xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] p-3 shadow-xl ${up ? "bottom-full mb-1" : "top-full mt-1"}`}>
            <TimeWheel value={draft} onChange={setDraft} labels={copy.wheel} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="min-h-11 rounded-lg border border-slate-300 dark:border-[#4a4a4a] text-sm font-semibold" onClick={() => setOpen(false)}>{copy.cancel}</button>
              <button type="button" data-testid="time-picker-ok" className="min-h-11 rounded-lg bg-blue-600 text-sm font-semibold text-white"
                onClick={() => { onChange(formatClockTime(draft)); setOpen(false) }}>OK</button>
            </div>
          </div>
        ) : null}
      </div>
    )
  })
