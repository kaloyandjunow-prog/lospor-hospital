import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))

import { pressByText } from "@/test/render"
import { AgentSheet } from "./AgentSheet"
import { DoseSelector } from "./DoseSelector"
import { renderWithPreferences } from "./fluid-sheet-test-fixtures"

describe("AgentSheet autofill on select", () => {
  it("prefills the agent percent with the library's first quick value", () => {
    const setAgPick = vi.fn()
    const setAgPercent = vi.fn()
    const tree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[{ name: "Sevoflurane", color: "#a855f7" }]}
        agPick={null}
        setAgPick={setAgPick}
        activeAgent={null}
        onConfirm={() => {}}
        quickPercents={{ Sevoflurane: [1, 2, 2.5, 3, 8] }}
        agPercent={null}
        setAgPercent={setAgPercent}
      />,
    )

    pressByText(tree, "Sevoflurane")

    expect(setAgPick).toHaveBeenCalledWith({ name: "Sevoflurane", color: "#a855f7" })
    expect(setAgPercent).toHaveBeenCalledWith(1)
  })

  it("keeps agent selection manual when the governed baseline is unavailable", () => {
    const agent = { name: "Sevoflurane", color: "#a855f7" }
    const setAgPercent = vi.fn()
    const tree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[agent]}
        agPick={null}
        setAgPick={() => {}}
        activeAgent={null}
        onConfirm={() => {}}
        quickPercents={{ Sevoflurane: [0.5, 1, 1.5, 2] }}
        agPercent={null}
        setAgPercent={setAgPercent}
        prospectiveGuidanceEnabled={false}
      />,
    )

    pressByText(tree, "Sevoflurane")
    expect(setAgPercent).toHaveBeenCalledWith(null)

    const selectedTree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[agent]}
        agPick={agent}
        setAgPick={() => {}}
        activeAgent={null}
        onConfirm={() => {}}
        quickPercents={{ Sevoflurane: [0.5, 1, 1.5, 2] }}
        agPercent={null}
        setAgPercent={() => {}}
        prospectiveGuidanceEnabled={false}
      />,
    )
    expect(selectedTree.root.findByType(DoseSelector).props.manualEntryOnly).toBe(true)
  })
})
