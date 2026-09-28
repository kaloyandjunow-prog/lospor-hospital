import React from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, t: (key: string) => key, language: "en" }) }))

import { CaseSaveStateContext, type CaseSaveState } from "@/lib/use-case-save-state"
import type { RunningItem } from "@/lib/intraop-running"
import { render } from "@/test/render"
import { TimetableRow } from "./TimetableRow"

// A row says whether what it holds reached the server (9.13.0), from the
// queue -- for the running infusion's stop as much as for a dose.

const running: RunningItem[] = [{ id: "inf-i", label: "Remifentanil 0.1", color: "#3b82f6", eventIds: ["start", "stop"] }]

function row(saveState: Partial<CaseSaveState>, expanded = false) {
  const state: CaseSaveState = {
    queuedEventIds: [], sendingEventId: null, refused: [], queuedSections: [], dismissRefused: () => {}, ...saveState,
  }
  const noop = () => {}
  return render(
    <CaseSaveStateContext.Provider value={state}>
      <TimetableRow
        col={3} chartStart={new Date("2026-09-27T11:00:00.000Z")} rowHeight={60}
        isNow={false} isQuarter={false} isExpanded={expanded} nowSlotPercent={0}
        rowEvents={[]} running={running}
        summary={{ criticalParts: [], normalParts: [], eventParts: [], drugParts: [], hasCritical: false, hasUnsynced: false } as never}
        labelOf={() => ""} activeInfusions={[]} activeFluids={[]} activeAgents={[]} activeGas={null as never}
        onExpand={noop} onCollapse={noop} onManageInfusion={noop} onEndFluid={noop} onEditGas={noop} onStopAgent={noop} onQuickAdd={noop}
      />
    </CaseSaveStateContext.Provider>,
  )
}

const has = (tree: ReturnType<typeof render>, testID: string) => tree.root.findAll(node => node.props?.testID === testID).length > 0

describe("a chart row's save state", () => {
  it("is quiet when everything is saved", () => {
    expect(has(row({}), "row-save-queued")).toBe(false)
    expect(has(row({}, true), "item-save-queued")).toBe(false)
  })

  it("says not yet saved when a running infusion's stop is queued", () => {
    // Collapsed, the row says so; opened, the infusion itself does.
    expect(has(row({ queuedEventIds: ["stop"] }), "row-save-queued")).toBe(true)
    expect(has(row({ queuedEventIds: ["stop"] }, true), "item-save-queued")).toBe(true)
  })

  it("says refused before anything else", () => {
    const tree = row({ queuedEventIds: ["stop"], refused: [{ eventId: "start", status: 403, at: "2026-09-27T11:05:00.000Z" }] })
    expect(has(tree, "row-save-refused")).toBe(true)
  })
})
