"use client"

import { useEffect, useRef, type ReactNode } from "react"

/**
 * A +/- button that keeps stepping while held: one step at once, then after
 * 400 ms a step every 120 ms, and every 50 ms after another 1.5 s.
 *
 * On a touch screen a long press is also the browser's own gesture: it selects
 * the text under the finger, shows the copy/callout menu, and the contextmenu
 * it fires can cancel the pointer and stop the repeat. This button keeps the
 * press for itself: the default on pointerdown and contextmenu is prevented,
 * and selection, the iOS callout and touch panning are off on the button.
 */
export function HoldRepeatButton({ onStep, className, children, tabIndex }: {
  /** Read afresh on every tick, so a held button steps from the latest value. */
  onStep: () => void
  className: string
  children: ReactNode
  tabIndex?: number
}) {
  const stepRef = useRef(onStep)
  useEffect(() => { stepRef.current = onStep })
  const timers = useRef<{ initial?: ReturnType<typeof setTimeout>; faster?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({})

  function stop() {
    clearTimeout(timers.current.initial)
    clearTimeout(timers.current.faster)
    clearInterval(timers.current.repeat)
    timers.current = {}
  }
  useEffect(() => stop, [])

  function start() {
    stop()
    const step = () => stepRef.current()
    step()
    timers.current.initial = setTimeout(() => {
      timers.current.repeat = setInterval(step, 120)
      timers.current.faster = setTimeout(() => {
        clearInterval(timers.current.repeat)
        timers.current.repeat = setInterval(step, 50)
      }, 1500)
    }, 400)
  }

  return (
    <button
      type="button"
      tabIndex={tabIndex}
      className={`${className} select-none touch-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]`}
      onPointerDown={event => {
        if (event.button !== 0) return
        // No text selection, no focus jump, no emulated mouse events after the touch.
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        start()
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={event => event.preventDefault()}
      // Keyboard (Enter/Space) steps once; a pointer press has already stepped.
      onClick={event => { if (event.detail === 0) stepRef.current() }}
    >
      {children}
    </button>
  )
}
