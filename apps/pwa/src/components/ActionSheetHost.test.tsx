import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, getByText, pressByText } from "@/test/render"
import { ActionSheetHost } from "./ActionSheetHost"
import { showActionSheet, dismissActionSheet, getActionSheetSnapshot } from "@/lib/action-sheet-store"

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
})
