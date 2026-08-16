import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key }),
}))

import { render } from "@/test/render"
import { TimetableFooter } from "./TimetableFooter"

/**
 * The chart button is a read-only escape hatch from the cockpit. Two things
 * matter and neither is cosmetic: it must not appear where nothing can handle
 * it, and it must not disturb End case, which is destructive and sits in a
 * tired anaesthetist's thumb memory at the right-hand end of the row.
 */
function buttonLabels(tree: ReturnType<typeof render>): string[] {
  // String(node.type) rather than a direct comparison: the renderer types host
  // nodes as the DOM element union, which does not include React Native's
  // "Text", so comparing directly fails to typecheck even though it matches.
  return tree.root
    .findAll(node => String(node.type) === "Text")
    .map(node => node.children.filter(child => typeof child === "string").join(""))
    .filter(Boolean)
}

const base = {
  started: true,
  isWatching: false,
  onJumpToNow: () => {},
  onEndCase: () => {},
}

describe("TimetableFooter chart button", () => {
  it("is absent when no handler is supplied", () => {
    const labels = buttonLabels(render(<TimetableFooter {...base} />))
    expect(labels).not.toContain("tfViewChart")
    expect(labels).toContain("tfEndCase")
  })

  it("appears when a handler is supplied, and End case stays last", () => {
    const labels = buttonLabels(render(<TimetableFooter {...base} onViewChart={() => {}} />))
    expect(labels).toContain("tfViewChart")
    // Order is the assertion, not mere presence: End case must remain the
    // rightmost control so its position never shifts under the thumb.
    expect(labels).toEqual(["tfViewChart", "tfJumpToNow", "tfEndCase"])
  })

  it("opens the chart even while another clinician holds the case", () => {
    // isWatching disables editing, but looking is always allowed -- a read-only
    // view is exactly what an observer needs.
    const onViewChart = vi.fn()
    const tree = render(<TimetableFooter {...base} isWatching onViewChart={onViewChart} />)
    expect(buttonLabels(tree)).toContain("tfViewChart")
    // Rendering must never fire it; opening the chart is always a deliberate tap.
    expect(onViewChart).not.toHaveBeenCalled()
  })

  it("stays available before the case has started", () => {
    // Jump-to-now is disabled until the case starts; the chart is not, because
    // a case can carry pre-induction vitals worth looking at.
    const labels = buttonLabels(render(<TimetableFooter {...base} started={false} onViewChart={() => {}} />))
    expect(labels).toContain("tfViewChart")
  })
})
