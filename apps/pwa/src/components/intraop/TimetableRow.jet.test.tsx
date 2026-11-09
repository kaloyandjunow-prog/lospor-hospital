import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, t: (key: string) => key, language: "en" }) }))

import { projectIntraopEvents } from "@lospor/core/intraop-engine"
import type { TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/lib/intraop-log-event"
import { runningItemsByCol, type RunningItem } from "@/lib/intraop-running"
import { CaseSaveStateContext, type CaseSaveState } from "@/lib/use-case-save-state"
import { render } from "@/test/render"
import { TimetableRow } from "./TimetableRow"

// Jet ventilation runs like the agent and the fresh gas (10.2.0): a strip down
// the right edge of every row it runs through, and a card to change or stop it.

const start = new Date("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString()
const log = [
  { id: "a", ts: at(0), type: "agent_start", name: "SEVOFLURANE", color: "#a78bfa", agentMode: "concurrent" },
  { id: "j1", ts: at(10), type: "jet_start", jetPressureBar: 2, jetRate: 150, fio2: 100 },
] as LogEvent[]
const chart = projectIntraopEvents(log as never, { start: start.toISOString(), openThrough: at(25) }) as unknown as TimetableData
const saved: CaseSaveState = { queuedEventIds: [], sendingEventId: null, refused: [], queuedSections: [], dismissRefused: () => {} }

function row(col: number, isExpanded: boolean, onEditJet = vi.fn()) {
  const running = runningItemsByCol(chart, [col]).get(col) ?? []
  const noop = () => {}
  const tree = render(
    <CaseSaveStateContext.Provider value={saved}>
      <TimetableRow col={col} chartStart={start} rowHeight={60} isNow={false} isQuarter={false} isExpanded={isExpanded} nowSlotPercent={0}
        rowEvents={[]} running={running}
        summary={{ criticalParts: [], normalParts: [], eventParts: [], drugParts: [], hasCritical: false, hasUnsynced: false } as never}
        labelOf={() => ""} activeInfusions={[]} activeFluids={[]} activeAgents={[]} activeGas={null as never}
        onExpand={noop} onCollapse={noop} onManageInfusion={noop} onEndFluid={noop} onEditGas={noop} onEditJet={onEditJet} onStopAgent={noop} onQuickAdd={noop} />
    </CaseSaveStateContext.Provider>,
  )
  return { tree, running, onEditJet }
}

const strips = (tree: ReturnType<typeof render>) =>
  tree.root.findAll(node => typeof node.type === "string" && node.props?.style && !Array.isArray(node.props.style) && node.props.style.width === 5 && typeof node.props.style.backgroundColor === "string")
    .map(node => (node.props.style as { backgroundColor: string }).backgroundColor)

describe("jet ventilation in the phone's rows (10.2.0)", () => {
  it("is a strip down the right edge of the row beside the agent's, teal, from the start on", () => {
    const { running } = row(3, false)
    expect(running.map(item => item.id)).toEqual(expect.arrayContaining(["agent-SEVOFLURANE", expect.stringMatching(/^jet/)]))
    const { tree } = row(3, false)
    expect(strips(tree)).toHaveLength(2)
    expect(strips(tree).some(color => color.startsWith("#14b8a6"))).toBe(true)
    expect(strips(row(1, false).tree)).toHaveLength(1) // before the jet: the agent alone
  })

  it("an expanded row lists it as a card that opens the jet sheet at that row", () => {
    const { tree, onEditJet } = row(4, true)
    const card = tree.root.findAll(node => typeof node.props?.onPress === "function" && JSON.stringify(node.props.style ?? {}).includes("#14b8a6"))[0]!
    act(() => { card.props.onPress() })
    expect(onEditJet).toHaveBeenCalledWith(4)
  })
})

export type { RunningItem }

describe("the Jet quick add in an expanded row", () => {
  it("appears beside FGF once Jet is ticked among the ventilation modes, and not before", async () => {
    const { jetSheet } = await import("@/lib/jet-sheet")
    const { tree } = row(2, true)
    const has = () => tree.root.findAll(node => node.props?.testID === "timetable-quick-add-jet").length > 0
    expect(has()).toBe(false)
    act(() => jetSheet.setEnabled(true))
    expect(has()).toBe(true)
    act(() => jetSheet.setEnabled(false))
    expect(has()).toBe(false)
  })
})
