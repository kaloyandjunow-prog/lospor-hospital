// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { isTypedMedication } from "@lospor/core/preop-orders"
import { TagInput, type Tag } from "./TagInput"

/**
 * A current medication not in the list, typed as written (10.6.0). Where the
 * hospital allows it the dropdown always ends with a row that adds the typed
 * text; the drug list stays the first choice, so Enter still picks a hit.
 */
type Drug = { name: string; inn: string; atc: string }

const freeTextRow = {
  label: (typed: string) => `Add "${typed}" as written`,
  typedMark: "typed",
  isTyped: isTypedMedication,
}

function renderInput(value: Tag[], onChange: (tags: Tag[]) => void, withRow: boolean) {
  return render(
    <TagInput<Drug>
      value={value}
      onChange={onChange}
      searchUrl="/api/search/drugs"
      renderSuggestion={item => ({ label: item.name, inn: item.inn, atcCode: item.atc })}
      allowFreeText={false}
      freeTextRow={withRow ? freeTextRow : undefined}
    />,
  )
}

async function type(text: string) {
  const input = screen.getByRole("textbox")
  fireEvent.change(input, { target: { value: text } })
  // The search is debounced by 150 ms.
  await act(async () => { await vi.advanceTimersByTimeAsync(200) })
  return input
}

describe("typing a medication that is not in the list", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("adds the typed text from the last row, and marks the chip", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })))
    const onChange = vi.fn()
    renderInput([], onChange, true)
    await type("Билков чай")
    fireEvent.mouseDown(screen.getByTestId("tag-input-typed-row"))
    expect(onChange).toHaveBeenCalledWith([{ label: "Билков чай" }])

    renderInput([{ label: "Билков чай" }, { label: "Bisoprolol", inn: "bisoprolol", atcCode: "C07AB07" }], () => {}, true)
    expect(screen.getAllByTestId("tag-input-typed-mark")).toHaveLength(1)
  })

  it("keeps Enter on the first drug found", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [{ name: "Bisoprolol 5 mg", inn: "bisoprolol", atc: "C07AB07" }] })))
    const onChange = vi.fn()
    renderInput([], onChange, true)
    const input = await type("bisop")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith([{ label: "Bisoprolol 5 mg", inn: "bisoprolol", atcCode: "C07AB07" }])
  })

  it("offers no typed row, and adds nothing on Enter, where the hospital has not allowed it", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })))
    const onChange = vi.fn()
    renderInput([], onChange, false)
    const input = await type("Билков чай")
    expect(screen.queryByTestId("tag-input-typed-row")).toBeNull()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onChange).not.toHaveBeenCalled()
  })
})
