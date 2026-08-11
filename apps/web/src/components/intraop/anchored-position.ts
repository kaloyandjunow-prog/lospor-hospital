/**
 * Where a popover sits relative to the cell that opened it.
 *
 * The same six lines were written out at every popover on the intraop screen —
 * about ten copies, each free to drift. They decide two things that matter on a
 * touch screen at 2am: that the panel does not run off the right edge, and that
 * it flips above the cell when there is not enough room below rather than
 * pushing its buttons under the fold.
 */

export type AnchorRect = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
}

export type Viewport = {
  width: number
  height: number
}

export type PopoverPlacement = {
  left: number
  top: number
  /** True when the panel is rendered upwards from `top`. */
  showAbove: boolean
}

/** Gap kept between the panel and the viewport edge. */
const EDGE_MARGIN = 8

export type PositionPopoverInput = {
  anchor: AnchorRect
  width: number
  viewport: Viewport
  /** Flip above when there is less room than this below the anchor. */
  flipBelowSpace: number
  /** Centre on the anchor rather than aligning to its left edge. */
  align?: "left" | "center"
  /** Gap below the anchor when not flipped. */
  belowGap?: number
}

export function positionPopover({
  anchor,
  width,
  viewport,
  flipBelowSpace,
  align = "left",
  belowGap = 4,
}: PositionPopoverInput): PopoverPlacement {
  const showAbove = viewport.height - anchor.bottom < flipBelowSpace

  const preferredLeft = align === "center"
    ? anchor.left + anchor.width / 2 - width / 2
    : anchor.left

  // Clamp to the viewport, but never past the left margin: on a narrow screen
  // the panel starts at the edge rather than off it.
  const left = Math.max(
    EDGE_MARGIN,
    Math.min(preferredLeft, viewport.width - width - EDGE_MARGIN),
  )

  // Above: `top` is the anchor's top and the panel is translated up from there.
  // Below: it hangs a few pixels under the anchor.
  const top = showAbove ? anchor.top - 4 : anchor.bottom + belowGap

  return { left, top, showAbove }
}

/** Width that fits the viewport, never below a usable minimum. */
export function fitPopoverWidth(preferred: number, viewportWidth: number, minimum = 180): number {
  return Math.min(preferred, Math.max(minimum, viewportWidth - 16))
}
