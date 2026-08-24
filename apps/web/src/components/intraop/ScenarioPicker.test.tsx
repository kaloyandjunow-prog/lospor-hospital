// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ScenarioPicker } from "./ScenarioPicker"

const labels = {
  favourites: "Favourites",
  browseAll: "Browse all",
  search: "Search drug",
  empty: "Nothing found",
  favouritesHint: "Choose favourites",
  back: "Back",
  selected: "selected",
  manualEntry: "Manual entry only",
}

const scenarios = [{
  key: "induction",
  label: "Induction",
  color: "#8b5cf6",
  items: [
    { label: "Visible", canonical: "Visible Drug" },
    { label: "Hidden", canonical: "Hidden Drug" },
  ],
}]

function renderPicker(onPick = vi.fn()) {
  render(
    <ScenarioPicker
      scenarios={scenarios}
      favourites={["Visible Drug", "Hidden Drug"]}
      browse={[{
        cat: "Routine",
        color: "border-blue-200",
        items: [{ name: "Visible Drug", unit: "mg" }],
      }]}
      searchOnly={[{
        cat: "Routine",
        color: "border-amber-200",
        items: [{ name: "Hidden Drug", unit: "mg", manualEntryOnly: true }],
      }]}
      labels={labels}
      onPick={onPick}
    />,
  )
  return onPick
}

describe("routine-hidden clinical options", () => {
  it("keeps them out of routine scenarios, favourites and browse", () => {
    renderPicker()

    expect(screen.queryByText("Hidden Drug")).toBeNull()
    expect(screen.getByText("1 selected")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /Induction/ }))
    expect(screen.queryByRole("button", { name: "Hidden Drug" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    fireEvent.click(screen.getByRole("button", { name: "Browse all" }))
    expect(screen.queryByRole("button", { name: /Hidden Drug/ })).toBeNull()
  })

  it("offers an explicit manual-only result when the clinician searches", () => {
    const onPick = renderPicker()

    fireEvent.change(screen.getByPlaceholderText("Search drug"), { target: { value: "hidden" } })
    fireEvent.click(screen.getByRole("button", { name: /Hidden DrugManual entry only/ }))

    expect(onPick).toHaveBeenCalledWith("Hidden Drug", "mg", true)
  })
})
