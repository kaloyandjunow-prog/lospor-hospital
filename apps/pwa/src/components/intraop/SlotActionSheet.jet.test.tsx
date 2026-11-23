import React from "react"
import { act } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: "en" }) }))
vi.mock("@/theme/shade", () => ({ useShade: () => (hex: string) => hex }))
vi.mock("./Sheet", () => ({ Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("./FeedbackPressable", () => ({ FeedbackPressable: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

import { render } from "@/test/render"
import { jetSheet } from "@/lib/jet-sheet"
import { SlotActionSheet } from "./SlotActionSheet"

function sheet(onOpenJet?: () => void) {
  return render(
    <SlotActionSheet visible title="12:45" eventSearch="" complicationExpanded={false} eventCategories={[]} isGACase={false}
      activeAgents={[]} activeGas={null as never} likelyEvents={[]} onDismissLikely={() => {}} onClose={() => {}}
      onEventSearchChange={() => {}} onToggleComplications={() => {}} onSelectEvent={() => {}} onBrowseDrugs={() => {}}
      onStopAgent={() => {}} onOpenAgent={() => {}} onStopGas={() => {}} onOpenGas={() => {}} onOpenJet={onOpenJet} />,
  )
}
const hasJet = (tree: ReturnType<typeof render>) => tree.root.findAll(node => node.props?.testID === "slot-jet").length > 0

afterEach(() => { act(() => jetSheet.setEnabled(false)) })

describe("changing the concentration of a running agent", () => {
  const running = [{ name: "Sevoflurane", color: "#a855f7", percent: 1.5 }]
  function withAgent(onChangeAgent?: (name: string) => void, onStopAgent: (name: string) => void = () => {}) {
    return render(
      <SlotActionSheet visible title="12:45" eventSearch="" complicationExpanded={false} eventCategories={[]} isGACase
        activeAgents={running} activeGas={null as never} likelyEvents={[]} onDismissLikely={() => {}} onClose={() => {}}
        onEventSearchChange={() => {}} onToggleComplications={() => {}} onSelectEvent={() => {}} onBrowseDrugs={() => {}}
        onStopAgent={onStopAgent} onChangeAgent={onChangeAgent} onOpenAgent={() => {}} onStopGas={() => {}} onOpenGas={() => {}} />,
    )
  }
  // 10.8.0: a running agent is worked with from its own menu in the row (Change dose, Stop),
  // not from the event sheet, so the sheet offers neither.
  it("no longer offers Change % or Stop for a running agent", () => {
    const onChange = vi.fn()
    const tree = withAgent(onChange)
    expect(tree.root.findAll(node => node.props?.testID === "slot-change-agent-Sevoflurane").length).toBe(0)
    expect(onChange).not.toHaveBeenCalled()
  })
  it("shows no Change % where nothing handles it", () => {
    const tree = withAgent(undefined)
    expect(tree.root.findAll(node => node.props?.testID === "slot-change-agent-Sevoflurane").length).toBe(0)
  })
})

describe("the Jet button in the column sheet", () => {
  it("is absent until Jet is ticked among the ventilation modes, then appears while the sheet is open", () => {
    const tree = sheet(() => {})
    expect(hasJet(tree)).toBe(false)
    act(() => jetSheet.setEnabled(true))
    expect(hasJet(tree)).toBe(true)
    act(() => jetSheet.setEnabled(false))
    expect(hasJet(tree)).toBe(false)
  })
})
