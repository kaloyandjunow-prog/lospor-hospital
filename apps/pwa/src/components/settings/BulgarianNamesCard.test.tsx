import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, getByText } from "@/test/render"
import { BulgarianNamesCard } from "./BulgarianNamesCard"

const setBulgarianNames = vi.fn()

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    t: (key: string) => key,
    bulgarianNames: { premed: false, drugs: true, infusions: false, agents: false, fluids: false },
    setBulgarianNames,
  }),
}))

describe("BulgarianNamesCard", () => {
  it("shows one switch per catalogue and saves only the one changed", () => {
    const tree = render(<BulgarianNamesCard />)
    expect(getByText(tree, "bulgarianNames")).toBeTruthy()
    const found = tree.root.findAll(node => typeof node.props.testID === "string" && node.props.testID.startsWith("bulgarian-names-") && typeof node.props.onValueChange === "function")
    // The renderer lists a switch and its host element; one per testID.
    const switches = found.filter((node, index) => found.findIndex(other => other.props.testID === node.props.testID) === index)
    expect(switches.map(node => [node.props.testID, node.props.value])).toEqual([
      ["bulgarian-names-premed", false],
      ["bulgarian-names-drugs", true],
      ["bulgarian-names-infusions", false],
      ["bulgarian-names-agents", false],
      ["bulgarian-names-fluids", false],
    ])
    switches[4].props.onValueChange(true)
    expect(setBulgarianNames).toHaveBeenCalledWith({ fluids: true })
  })
})
