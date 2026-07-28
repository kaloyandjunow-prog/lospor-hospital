import React from "react"
import { describe, expect, it, vi } from "vitest"

import { getByText, pressByText, render, update } from "@/test/render"
import { MultiToggle, PrimaryButton, SingleToggle, StatusBadge } from "./ui"
import { PreferencesProvider } from "@/lib/preferences-context"
import { AuthProvider } from "@/lib/auth-context"

describe("shared UI components", () => {
  it("renders canonical case status labels", () => {
    const tree = render(
      <AuthProvider>
        <PreferencesProvider>
          <StatusBadge status="AWAITING_POSTOP" />
        </PreferencesProvider>
      </AuthProvider>,
    )

    expect(getByText(tree, "Awaiting postop")).toBeTruthy()
  })

  it("fires primary button presses when enabled", () => {
    const onPress = vi.fn()
    const tree = render(<PrimaryButton label="Save case" onPress={onPress} />)

    pressByText(tree, "Save case")

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("does not fire primary button presses while disabled", () => {
    const onPress = vi.fn()
    const tree = render(<PrimaryButton label="Save case" onPress={onPress} disabled />)

    pressByText(tree, "Save case")

    expect(onPress).not.toHaveBeenCalled()
  })

  it("adds and removes multi-toggle values", () => {
    const onChange = vi.fn()
    const options = [
      { v: "supine", label: "Supine" },
      { v: "prone", label: "Prone" },
    ]

    const tree = render(
      <MultiToggle options={options} value={["supine"]} onChange={onChange} />,
    )

    pressByText(tree, "Prone")
    expect(onChange).toHaveBeenLastCalledWith(["supine", "prone"])

    update(tree, <MultiToggle options={options} value={["supine", "prone"]} onChange={onChange} />)
    pressByText(tree, "Supine")
    expect(onChange).toHaveBeenLastCalledWith(["prone"])
  })

  it("can deselect the selected single-toggle value", () => {
    const onChange = vi.fn()
    const options = [
      { v: "ward", label: "Ward" },
      { v: "icu", label: "ICU" },
    ]

    const tree = render(
      <SingleToggle options={options} value="ward" onChange={onChange} />,
    )

    pressByText(tree, "Ward")

    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
