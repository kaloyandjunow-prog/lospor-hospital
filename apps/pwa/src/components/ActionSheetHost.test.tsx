import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, getByText, pressByText } from "@/test/render"
import { ActionSheetHost } from "./ActionSheetHost"
import { showActionSheet, dismissActionSheet, getActionSheetSnapshot } from "@/lib/action-sheet-store"

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    t: (key: string) => key === "cancel" ? "Отказ" : key,
  }),
}))

describe("ActionSheetHost", () => {
  beforeEach(() => dismissActionSheet())

  it("renders nothing when there is no request", () => {
    const tree = render(<ActionSheetHost />)
    expect(tree.toJSON()).toBeNull()
  })

  it("renders the title + actions and fires onPress, then dismisses", () => {
    const onPress = vi.fn()
    showActionSheet({ title: "Event", actions: [
      { label: "Delete", destructive: true, onPress },
      { label: "Cancel", cancel: true },
    ] })

    const tree = render(<ActionSheetHost />)
    expect(getByText(tree, "Event")).toBeTruthy()
    expect(getByText(tree, "Delete")).toBeTruthy()

    pressByText(tree, "Delete")
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(getActionSheetSnapshot()).toBeNull() // host dismissed the sheet
  })

  // A caller waiting on the answer (the allergy check) must hear "no" when the
  // sheet is closed by the back gesture or a tap outside, not nothing.
  it("runs the cancel action when the sheet is closed any other way", () => {
    const onCancel = vi.fn()
    showActionSheet({ title: "Allergy", actions: [
      { label: "Give anyway", destructive: true },
      { label: "Don't give", cancel: true, onPress: onCancel },
    ] })

    const tree = render(<ActionSheetHost />)
    const modal = tree.root.findAll(node => typeof node.props.onRequestClose === "function")[0]
    modal.props.onRequestClose()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(getActionSheetSnapshot()).toBeNull()
  })

  it("localizes the fallback cancel action when the caller omits one", () => {
    showActionSheet({ title: "Event", actions: [{ label: "Delete" }] })

    const tree = render(<ActionSheetHost />)
    expect(getByText(tree, "Отказ")).toBeTruthy()
  })
})
