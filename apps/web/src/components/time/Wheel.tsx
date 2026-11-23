"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * One looping wheel column (10.8.0), the same for the time and the date: the
 * values repeat above and below, so scrolling past the last one reaches the
 * first. Snaps to a value; the centred value is the chosen one. Each value is
 * a 44 px target (tap one to pick it).
 */
const ITEM_PX = 44
const REPEATS = 5

export function Wheel({ values, value, onChange, format, label, testId }: {
  values: number[]
  value: number
  onChange: (value: number) => void
  format?: (value: number) => string
  label: string
  testId?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const count = values.length
  const index = Math.max(0, values.indexOf(value))
  const middle = Math.floor(REPEATS / 2) * count

  const scrollTo = useCallback((position: number, smooth: boolean) => {
    const el = ref.current
    if (!el) return
    // Older engines (and jsdom) have no element scrollTo: set the position instead.
    if (typeof el.scrollTo === "function") el.scrollTo({ top: position * ITEM_PX, behavior: smooth ? "smooth" : "auto" })
    else el.scrollTop = position * ITEM_PX
  }, [])

  // Centre the chosen value in the middle repeat whenever it changes from outside.
  useEffect(() => { scrollTo(middle + index, false) }, [index, middle, scrollTo])

  const onScroll = () => {
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const position = Math.round(el.scrollTop / ITEM_PX)
      const next = values[((position % count) + count) % count]
      // Back to the middle repeat, so the wheel never runs out either way.
      scrollTo(middle + values.indexOf(next), false)
      if (next !== value) onChange(next)
    }, 120)
  }
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current) }, [])

  // The mouse wheel: one notch is one step, the same as the arrow keys. (A touch screen scrolls the column itself.)
  const latest = useRef({ values, onChange })
  const position = useRef(index)
  useEffect(() => { latest.current = { values, onChange }; position.current = index })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let travelled = 0
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      travelled += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      if (Math.abs(travelled) < 40) return
      const step = travelled > 0 ? 1 : -1
      travelled = 0
      const { values: list, onChange: change } = latest.current
      if (list.length === 0) return
      // Notches before the screen has redrawn go on from the last one.
      position.current = (position.current + step + list.length) % list.length
      change(list[position.current])
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  const items = Array.from({ length: REPEATS * count }, (_, i) => values[i % count])
  return (
    <div className="relative" style={{ height: ITEM_PX * 5, width: 72 }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-1 rounded-lg border border-slate-300 dark:border-[#4a4a4a] bg-slate-100/60 dark:bg-white/5" style={{ top: ITEM_PX * 2, height: ITEM_PX }} />
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        data-testid={testId}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={event => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
          event.preventDefault()
          onChange(values[(index + (event.key === "ArrowDown" ? 1 : -1) + count) % count])
        }}
        className="h-full overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
        style={{ paddingTop: ITEM_PX * 2, paddingBottom: ITEM_PX * 2 }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={item === value && Math.floor(i / count) === Math.floor(REPEATS / 2)}
            tabIndex={-1}
            onClick={() => { onChange(item); scrollTo(middle + values.indexOf(item), true) }}
            className={`block w-full snap-center text-center font-mono tabular-nums text-lg ${item === value ? "font-bold text-slate-900 dark:text-white" : "text-slate-400 dark:text-[#777]"}`}
            style={{ height: ITEM_PX }}
          >
            {format ? format(item) : item}
          </button>
        ))}
      </div>
    </div>
  )
}
