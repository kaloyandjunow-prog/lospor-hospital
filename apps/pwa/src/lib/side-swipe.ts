/**
 * When a sideways swipe changes the section (preop) or the tab (intraop).
 *
 * It was easy to trip (10.0.0): the preop section took the gesture after 10 px
 * sideways and changed on any flick faster than 0.5 px/ms, however short, so a
 * thumb's arc while scrolling down could move the card or the section. One rule
 * for both screens now:
 *
 * - a swipe is only claimed after 14 px sideways, and only when it is clearly
 *   sideways (at least twice as far across as down);
 * - a gesture that has gone 10 px up or down first is a scroll, and stays one
 *   until the finger lifts: no sideways drift takes it over halfway;
 * - it changes the section on release after 12% of the screen width
 *   (counted from where the swipe was taken, about 25-40 px in), or on
 *   a fast flick that has also travelled 25 px;
 * - the card follows the finger at nine tenths of its pace.
 *
 * Tried on a phone (2026-10-27): a quarter of the width and 60 px flicks took
 * too much force. With the scroll lock in place they were lightened twice
 * more, to these.
 */
export const SIDE_SWIPE_CLAIM_PX = 14
export const SIDE_SWIPE_RATIO = 2
/** A finger that has gone this far up or down, more than across, is scrolling. */
export const SIDE_SWIPE_VERTICAL_LOCK_PX = 10
export const SIDE_SWIPE_DISTANCE_SHARE = 0.12
export const SIDE_SWIPE_FLICK_VX = 0.45
export const SIDE_SWIPE_FLICK_MIN_PX = 25
export const SIDE_SWIPE_FOLLOW = 0.9

/** Whether the gesture so far is a sideways swipe this screen should take. */
export function claimsSideSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SIDE_SWIPE_CLAIM_PX && Math.abs(dx) >= Math.abs(dy) * SIDE_SWIPE_RATIO
}

/**
 * On release: 1 to go to the next section (the finger moved left), -1 to the
 * previous one, null to stay.
 */
export function sideSwipeStep(dx: number, dy: number, vx: number, screenWidth: number): -1 | 1 | null {
  if (!claimsSideSwipe(dx, dy)) return null
  const far = Math.abs(dx) >= screenWidth * SIDE_SWIPE_DISTANCE_SHARE
  const flick = Math.abs(vx) >= SIDE_SWIPE_FLICK_VX && Math.abs(dx) >= SIDE_SWIPE_FLICK_MIN_PX && Math.sign(vx) === Math.sign(dx)
  if (!far && !flick) return null
  return dx < 0 ? 1 : -1
}

/**
 * How long the card takes to leave once a swipe is decided: it carries on at
 * the finger's own speed (px/ms) over the distance left, within 140-260 ms,
 * so a quick flick leaves quickly and a slow drag does not jump (10.0.0).
 */
export function sideSwipeExitMs(remainingPx: number, vx: number): number {
  const speed = Math.max(Math.abs(vx), 0.9)
  return Math.round(Math.min(260, Math.max(140, Math.abs(remainingPx) / speed)))
}

/** The card's opacity while it is dragged: a slight fade, never below 0.7. */
export function sideSwipeFade(dx: number, screenWidth: number): number {
  return 1 - 0.3 * Math.min(1, Math.abs(dx) / Math.max(1, screenWidth))
}

/**
 * How far the card moves for a finger that has moved `dx`: nothing until the
 * swipe is claimed, then from there, so it does not jump or drift.
 */
export function sideSwipeFollow(dx: number): number {
  const past = Math.abs(dx) - SIDE_SWIPE_CLAIM_PX
  return past > 0 ? Math.sign(dx) * past * SIDE_SWIPE_FOLLOW : 0
}

/**
 * Whether a gesture becomes a sideways swipe, remembering a scroll: once a
 * gesture has gone up or down first it is a scroll until the finger lifts
 * (tried on a phone, 2026-10-27: scrolling started to slide sideways). One per
 * responder. `start` is called as each touch begins, from the responder's
 * capture-phase start handler, which runs even when a field under the finger
 * takes the touch. (The PanResponder's stateID is no use for this: it only
 * changes when a pan is granted, so one scroll would lock every later swipe.)
 */
export function sideSwipeGate() {
  let scrolling = false
  return {
    start(): false { scrolling = false; return false },
    claims(dx: number, dy: number): boolean {
      if (scrolling) return false
      if (Math.abs(dy) >= SIDE_SWIPE_VERTICAL_LOCK_PX && Math.abs(dy) >= Math.abs(dx)) { scrolling = true; return false }
      return claimsSideSwipe(dx, dy)
    },
  }
}
