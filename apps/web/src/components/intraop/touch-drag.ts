"use client"

import { useEffect, type RefObject } from "react"

/**
 * The timeline's bars are moved and stretched by the browser's drag and drop,
 * which a mouse starts and a finger, on most touch screens, does not (10.0.0:
 * a touch drag fired no dragstart at all). This turns a finger's press, hold
 * and slide inside the timeline into the same drag events, so every existing
 * drag (a bar's ends, a whole infusion, a rate boundary, a drug or a fluid onto
 * a column) works by touch with no second implementation to keep in step.
 *
 * Press and hold, not a plain slide: a quick swipe still scrolls the chart, and
 * a hold of 0.4 s on a bar picks it up. On a device without a touch screen the
 * library does not listen at all, so the mouse is untouched.
 */
export const TOUCH_DRAG_OPTIONS = {
  isPressHoldMode: true,
  pressHoldDelayMS: 400,
  /** A finger that moves this far before the hold ends was scrolling. */
  pressHoldMargin: 15,
  /** The chart scrolls inside itself; the page is not scrolled under the finger. */
  allowDragScroll: false,
} as const

export function useTouchDrag(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current
    if (!element) return
    let cancelled = false
    void import("@dragdroptouch/drag-drop-touch").then(({ enableDragDropTouch }) => {
      // Its listeners live on this element, and go with it when it unmounts.
      if (!cancelled) enableDragDropTouch(element, document, TOUCH_DRAG_OPTIONS)
    })
    const keepLift = forwardLiftFromRemovedTarget(element)
    element.addEventListener("touchstart", keepLift, { capture: true, passive: true })
    return () => {
      cancelled = true
      element.removeEventListener("touchstart", keepLift, { capture: true })
    }
  }, [root])
}

/**
 * The events of one touch stay with the element the finger first pressed. A
 * grip is drawn again at the column under the finger while it is dragged, so
 * that element leaves the page mid-drag and the finger lifting then reached
 * nothing: the drag never dropped. The lift is passed on to the timeline.
 */
export function forwardLiftFromRemovedTarget(root: HTMLElement) {
  return (start: TouchEvent) => {
    const target = start.target
    if (!(target instanceof Element)) return
    const forward = (lift: Event) => {
      target.removeEventListener("touchend", forward)
      target.removeEventListener("touchcancel", forward)
      if (target.isConnected) return // it reached the timeline on its own
      const touch = lift as TouchEvent
      root.dispatchEvent(new TouchEvent(touch.type, {
        bubbles: true,
        cancelable: true,
        touches: [...touch.touches],
        targetTouches: [...touch.targetTouches],
        changedTouches: [...touch.changedTouches],
      }))
    }
    target.addEventListener("touchend", forward)
    target.addEventListener("touchcancel", forward)
  }
}

/**
 * A finger is wider than a 10 px grip: on a touch screen the grip's hit area
 * reaches past it on both sides. With a mouse it is unchanged.
 */
export const TOUCH_GRIP = "pointer-coarse:before:absolute pointer-coarse:before:inset-y-0 pointer-coarse:before:-inset-x-3 pointer-coarse:before:content-['']"
