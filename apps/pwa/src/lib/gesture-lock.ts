/**
 * Whether a control is being pressed, held or dragged right now.
 *
 * Sliders, the energy knob and the +/- buttons that step while held all take a
 * gesture the screen's own side swipe (intraop tab, preop section) would also
 * like to claim: a thumb that drifts sideways while holding "+" or dragging a
 * slider must keep adjusting that value, never change the tab under it. The
 * swipe asks `gestureHeld()` before it claims anything.
 *
 * On the web the same flag stops the browser selecting text: while a control is
 * held the document is marked, the page's CSS turns text selection off, and
 * `selectstart` is cancelled.
 */
let held = 0
let webReady = false

const onWeb = () => typeof document !== "undefined" && !!document.documentElement

function installWebGuards() {
  if (webReady || !onWeb()) return
  webReady = true
  const block = (event: Event) => { if (held > 0) event.preventDefault() }
  document.addEventListener("selectstart", block)
  document.addEventListener("dragstart", block)
  // A finger that lifts outside the window, or a browser that drops the pointer, never reports the end of the
  // press; without this the swipe would stay locked for the rest of the session.
  const reset = () => { if (held > 0) { held = 0; mark() } }
  window.addEventListener("pointercancel", reset)
  window.addEventListener("blur", reset)
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset() })
  const lifted = (event: Event) => {
    const touches = (event as TouchEvent).touches
    if (touches && touches.length === 0) reset()
  }
  window.addEventListener("touchend", lifted, true)
  window.addEventListener("touchcancel", lifted, true)
}

function mark() {
  if (!onWeb()) return
  installWebGuards()
  const root = document.documentElement
  if (held > 0) root.setAttribute("data-gesture", "held")
  else root.removeAttribute("data-gesture")
}

/** Starts holding; call the returned function once, when the finger lifts or the gesture is taken away. */
export function holdGesture(): () => void {
  held += 1
  mark()
  let done = false
  return () => {
    if (done) return
    done = true
    held = Math.max(0, held - 1)
    mark()
  }
}

export function gestureHeld(): boolean {
  return held > 0
}

/**
 * One control's hold: `start` on grant or press-in, `end` on release, cancel or unmount; both are safe to repeat.
 *
 * A press that slides off its button is "pressed out" for the button but is still a finger on the glass, and it
 * is exactly then that a sideways swipe would take it. So on the web a hold also ends by itself when the pointer
 * or touch really ends, wherever that is; native controls end it from their own release or touch-end.
 */
export function createGestureHandle() {
  let release: (() => void) | null = null
  let detach: (() => void) | null = null
  const end = () => {
    detach?.(); detach = null
    release?.(); release = null
  }
  return {
    start() {
      if (release) return
      release = holdGesture()
      if (onWeb()) {
        const events = ["pointerup", "pointercancel", "touchend", "touchcancel", "mouseup"] as const
        const lifted = () => end()
        for (const name of events) window.addEventListener(name, lifted, true)
        detach = () => { for (const name of events) window.removeEventListener(name, lifted, true) }
      }
    },
    end,
  }
}
