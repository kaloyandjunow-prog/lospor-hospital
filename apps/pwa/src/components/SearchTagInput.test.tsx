import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ apiJson: vi.fn() }))
vi.mock("@/lib/api", () => ({ apiJson: api.apiJson }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ t: (key: string) => key, language: "en" }) }))

import { isTypedMedication } from "@lospor/core/preop-orders"
import { render } from "@/test/render"
import { SearchTagInput, type TagItem } from "./SearchTagInput"

/**
 * A current medication not in the list, typed as written (10.6.0): offered as
 * the dropdown's last row only where the hospital allows it.
 */
const freeTextRow = { label: (typed: string) => `Add "${typed}"`, typedMark: "typed", isTyped: (item: TagItem) => isTypedMedication(item) }

function field(onChange: (items: TagItem[]) => void, withRow: boolean, value: TagItem[] = []) {
  return render(
    <SearchTagInput label="Medications" kind="medication" endpoint="/api/search/drugs" value={value} onChange={onChange}
      freeTextRow={withRow ? freeTextRow : undefined} />,
  )
}

async function type(tree: ReturnType<typeof render>, text: string) {
  const input = tree.root.findAll(node => typeof node.props?.onChangeText === "function")[0]
  vi.useFakeTimers()
  act(() => { input.props.onChangeText(text) })
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  vi.useRealTimers()
}

const typedRow = (tree: ReturnType<typeof render>) => tree.root.findAll(node => node.props?.testID === "search-tag-typed-row" && typeof node.props?.onPress === "function")

describe("typing a medication that is not in the list", () => {
  it("adds the typed text from the last row", async () => {
    api.apiJson.mockResolvedValue([])
    const onChange = vi.fn()
    const tree = field(onChange, true)
    await type(tree, "Билков чай")
    act(() => { typedRow(tree)[0].props.onPress() })
    expect(onChange).toHaveBeenCalledWith([{ code: "Билков чай", label: "Билков чай" }])
  })

  it("marks a typed chip, not a drug from the list", () => {
    const tree = field(() => {}, true, [{ code: "Билков чай", label: "Билков чай" }, { code: "C07AB07", label: "Bisoprolol", atcCode: "C07AB07" } as TagItem])
    const text = JSON.stringify(tree.toJSON())
    expect(text).toContain("Билков чай · typed")
    expect(text).not.toContain("Bisoprolol · typed")
  })

  it("offers no typed row where the hospital has not allowed it", async () => {
    api.apiJson.mockResolvedValue([])
    const tree = field(() => {}, false)
    await type(tree, "Билков чай")
    expect(typedRow(tree)).toHaveLength(0)
  })
})
