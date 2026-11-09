"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

type Props = {
  children: ReactNode
  horizontal?: boolean
  className?: string
  contentClassName?: string
  style?: CSSProperties
  testId?: string
  startLabel?: string
  endLabel?: string
  /** Tailwind classes for the fade's opaque edge colour. */
  edgeClassName?: string
}

/**
 * Shared web treatment for clipped clinical rails and sheets. It does not
 * replace native scrolling: the fade and chevron only appear while content is
 * actually hidden, and the button advances the same scroll surface a short
 * distance. Wrapped rows may still use flex-wrap; this is for true overflow.
 */
export function OverflowCueScroll({
  children,
  horizontal = false,
  className = "",
  contentClassName = "",
  style,
  testId,
  startLabel = horizontal ? "Scroll left" : "Scroll up",
  endLabel = horizontal ? "Scroll right" : "Scroll down",
  edgeClassName = "from-white dark:from-[#111]",
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [cue, setCue] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const node = ref.current
    if (!node) return
    const max = horizontal
      ? node.scrollWidth - node.clientWidth
      : node.scrollHeight - node.clientHeight
    const offset = horizontal ? node.scrollLeft : node.scrollTop
    const next = { start: offset > 4, end: offset < max - 4 }
    setCue(current => current.start === next.start && current.end === next.end ? current : next)
  }, [horizontal])

  useEffect(() => {
    const node = ref.current
    if (!node) return
    measure()
    node.addEventListener("scroll", measure, { passive: true })
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(node)
    if (node.firstElementChild) observer?.observe(node.firstElementChild)
    return () => {
      node.removeEventListener("scroll", measure)
      observer?.disconnect()
    }
  }, [measure])

  const move = (direction: -1 | 1) => {
    const node = ref.current
    if (!node) return
    const amount = Math.max(160, (horizontal ? node.clientWidth : node.clientHeight) * 0.72)
    node.scrollBy(horizontal ? { left: direction * amount, behavior: "smooth" } : { top: direction * amount, behavior: "smooth" })
  }

  const scrollStyle: CSSProperties = { scrollbarWidth: "none" }
  const fadeBase = horizontal
    ? "pointer-events-none absolute inset-y-0 z-10 w-9"
    : "pointer-events-none absolute inset-x-0 z-10 h-9"
  const buttonBase = "absolute z-20 flex items-center justify-center text-slate-500 dark:text-slate-300 bg-white/85 dark:bg-[#111]/85 hover:text-slate-900 dark:hover:text-white"

  return (
    <div data-testid={testId} className={`relative min-w-0 min-h-0 ${className}`} style={style}>
      <div
        ref={ref}
        className={`min-w-0 min-h-0 ${horizontal ? "overflow-x-auto overflow-y-hidden" : "overflow-x-hidden overflow-y-auto"} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${contentClassName}`}
        style={scrollStyle}
      >
        {children}
      </div>
      {cue.start ? (
        <>
          <div aria-hidden className={`${fadeBase} ${horizontal ? "left-0 bg-gradient-to-r" : "top-0 bg-gradient-to-b"} ${edgeClassName} to-transparent`} />
          <button
            type="button"
            data-testid={testId ? `${testId}-scroll-start` : undefined}
            aria-label={startLabel}
            onClick={() => move(-1)}
            className={`${buttonBase} ${horizontal ? "inset-y-0 left-0 w-7" : "inset-x-0 top-0 h-7"}`}
          >{horizontal ? "‹" : "⌃"}</button>
        </>
      ) : null}
      {cue.end ? (
        <>
          <div aria-hidden className={`${fadeBase} ${horizontal ? "right-0 bg-gradient-to-l" : "bottom-0 bg-gradient-to-t"} ${edgeClassName} to-transparent`} />
          <button
            type="button"
            data-testid={testId ? `${testId}-scroll-end` : undefined}
            aria-label={endLabel}
            onClick={() => move(1)}
            className={`${buttonBase} ${horizontal ? "inset-y-0 right-0 w-7" : "inset-x-0 bottom-0 h-7"}`}
          >{horizontal ? "›" : "⌄"}</button>
        </>
      ) : null}
    </div>
  )
}
