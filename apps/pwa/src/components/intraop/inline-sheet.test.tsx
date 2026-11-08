import React from "react"
import { Text } from "react-native"
import { afterEach, describe, expect, it, vi } from "vitest"

import { act } from "react-test-renderer"
import { render } from "@/test/render"
import { InlineSheetSlot } from "./InlineSheetSlot"
import { inlineSheet } from "./inline-sheet"
import { Sheet } from "./Sheet"

const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]

afterEach(() => { act(() => inlineSheet.release()) })

describe("a card row's controls open in place (10.2.0)", () => {
  it("draws a sheet as usual while no card row holds the slot", () => {
    const tree = render(<Sheet visible onClose={() => {}} title="Drug"><Text>Dose controls</Text></Sheet>)
    expect(byId(tree, "sheet-header")).toBeTruthy()
    expect(byId(tree, "card-inline-dose")).toBeUndefined()
  })

  it("hands the sheet's title, body and footer to the row that holds the slot, and opens no modal", () => {
    const tree = render(
      <>
        <InlineSheetSlot id="ephedrine" />
        <Sheet visible onClose={() => {}} title="Ephedrine" footer={<Text>Administer</Text>}><Text>Dose controls</Text></Sheet>
      </>,
    )
    act(() => inlineSheet.activate("ephedrine"))
    expect(byId(tree, "sheet-header")).toBeUndefined()
    const slot = byId(tree, "card-inline-dose")!
    expect(slot).toBeTruthy()
    const text = JSON.stringify(slot.findAll(node => typeof node.children?.[0] === "string").map(node => node.children[0]))
    expect(text).toContain("Ephedrine")
    expect(text).toContain("Dose controls")
    expect(text).toContain("Administer")
  })

  it("shows nothing under a row that does not hold the slot", () => {
    const tree = render(
      <>
        <InlineSheetSlot id="phenylephrine" />
        <Sheet visible onClose={() => {}} title="Ephedrine"><Text>Dose controls</Text></Sheet>
      </>,
    )
    act(() => inlineSheet.activate("ephedrine"))
    expect(byId(tree, "card-inline-dose")).toBeUndefined()
  })

  it("folds away by closing the sheet that holds it, and frees the slot when the sheet closes", () => {
    const onClose = vi.fn()
    render(<Sheet visible onClose={onClose} title="Ephedrine"><Text>x</Text></Sheet>)
    act(() => inlineSheet.activate("ephedrine"))
    expect(inlineSheet.get().id).toBe("ephedrine")
    act(() => inlineSheet.fold())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(inlineSheet.get().id).toBeNull()
  })

  it("a sheet that is itself the card never moves into a row", () => {
    const tree = render(<Sheet visible onClose={() => {}} title="Card" allowInline={false}><Text>Rows</Text></Sheet>)
    act(() => inlineSheet.activate("ephedrine"))
    expect(byId(tree, "sheet-header")).toBeTruthy()
  })
})
