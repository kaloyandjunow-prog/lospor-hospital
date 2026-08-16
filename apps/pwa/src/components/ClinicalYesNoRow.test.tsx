import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    tc: (key: string) => ({ answerYes: "Да", answerNo: "Не", notAsked: "без отговор" }[key] ?? key),
  }),
}))

import { render } from "@/test/render"
import { ClinicalYesNoRow } from "./ClinicalYesNoRow"

/**
 * The control exists because a switch could not say "nobody asked". These tests
 * hold the three states apart, because the failure they guard against is silent:
 * an unanswered question rendering as a confident No looks completely normal.
 */
function press(tree: ReturnType<typeof render>, label: string) {
  const node = tree.root.findAll(n =>
    typeof n.type !== "string" && n.props?.accessibilityLabel === label)[0]
  expect(node, `no control labelled "${label}"`).toBeDefined()
  node.props.onPress()
}

function texts(tree: ReturnType<typeof render>): string[] {
  return tree.root
    .findAll(n => String(n.type) === "Text")
    .map(n => n.children.filter(c => typeof c === "string").join(""))
    .filter(Boolean)
}

const base = { label: "Тютюнопушене", onValueChange: () => {} }

describe("ClinicalYesNoRow", () => {
  it("says so when the question has not been asked", () => {
    // The whole point: a blank row must announce itself on a form of forty.
    expect(texts(render(<ClinicalYesNoRow {...base} value={null} />))).toContain("без отговор")
  })

  it("stops saying so once either answer is given", () => {
    expect(texts(render(<ClinicalYesNoRow {...base} value={true} />))).not.toContain("без отговор")
    expect(texts(render(<ClinicalYesNoRow {...base} value={false} />))).not.toContain("без отговор")
  })

  it("reports yes and no as different answers", () => {
    const yes = vi.fn()
    press(render(<ClinicalYesNoRow {...base} value={null} onValueChange={yes} />), "Тютюнопушене: Да")
    expect(yes).toHaveBeenCalledWith(true)

    const no = vi.fn()
    press(render(<ClinicalYesNoRow {...base} value={null} onValueChange={no} />), "Тютюнопушене: Не")
    expect(no).toHaveBeenCalledWith(false)
  })

  it("clears back to unanswered when the chosen side is tapped again", () => {
    // A mis-tap must be undoable. Without this the only way back from an
    // accidental answer is to record a different wrong one.
    const cleared = vi.fn()
    press(render(<ClinicalYesNoRow {...base} value={true} onValueChange={cleared} />), "Тютюнопушене: Да")
    expect(cleared).toHaveBeenCalledWith(null)
  })

  it("does not answer the question merely by rendering", () => {
    const touched = vi.fn()
    render(<ClinicalYesNoRow {...base} value={null} onValueChange={touched} />)
    expect(touched).not.toHaveBeenCalled()
  })

  it("marks only a positive finding, so a no is not alarming", () => {
    // latexAllergy passes activeColor=danger. A recorded "no allergy" must not
    // paint the row red, or the colour stops meaning anything.
    const danger = "#ef4444"
    const border = (value: boolean | null) => {
      const tree = render(<ClinicalYesNoRow {...base} value={value} activeColor={danger} />)
      const rows = tree.root.findAll(n => Array.isArray(n.props?.style) === false && n.props?.style?.borderRadius === 14)
      return rows[0]?.props?.style?.borderColor
    }
    expect(border(true)).toBe(danger)
    expect(border(false)).not.toBe(danger)
    expect(border(null)).not.toBe(danger)
  })
})
