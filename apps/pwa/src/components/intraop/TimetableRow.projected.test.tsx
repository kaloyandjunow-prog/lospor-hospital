import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, t: (key: string) => key, language: "en" }) }))

import { projectIntraopEvents } from "@lospor/core/intraop-engine"
import type { TimetableData } from "@/components/IntraopTimetable"
import type { ActiveInfusion, LogEvent } from "@/lib/intraop-log-event"
import { runningItemsByCol, type RunningItem } from "@/lib/intraop-running"
import { CaseSaveStateContext, type CaseSaveState } from "@/lib/use-case-save-state"
import { render } from "@/test/render"
import { TimetableRow } from "./TimetableRow"

// Propofol runs at 4 mg/kg/h from 14:45; at 14:50 the 15:55 row is opened to
// plan a change to 8 (9.13.1). The row shows propofol, dashed, and tapping it
// opens propofol's own sheet dated to that row -- never a second propofol.

const start = new Date("2026-09-28T11:45:00.000Z")
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString()
const log: LogEvent[] = [{ id: "p", ts: at(0), type: "infusion_start", infId: "prop", name: "Propofol", rate: "4", unit: "mg/kg/hr", color: "#8b5cf6" } as LogEvent]
const chart = projectIntraopEvents(log as never, { start: start.toISOString(), openThrough: at(5) }) as unknown as TimetableData
const propofol = { infId: "prop", name: "Propofol", rate: "4", unit: "mg/kg/hr", color: "#8b5cf6" } as ActiveInfusion
const row1555 = 14
const saved: CaseSaveState = { queuedEventIds: [], sendingEventId: null, refused: [], queuedSections: [], dismissRefused: () => {} }

function row(running: RunningItem[], onManageInfusion = vi.fn()) {
  const noop = () => {}
  const tree = render(
    <CaseSaveStateContext.Provider value={saved}>
      <TimetableRow
        col={row1555} chartStart={start} rowHeight={60}
        isNow={false} isQuarter={false} isExpanded nowSlotPercent={0}
        rowEvents={[]} running={running}
        summary={{ criticalParts: [], normalParts: [], eventParts: [], drugParts: [], hasCritical: false, hasUnsynced: false } as never}
        labelOf={() => ""} activeInfusions={[propofol]} activeFluids={[]} activeAgents={[]} activeGas={null as never}
        onExpand={noop} onCollapse={noop} onManageInfusion={onManageInfusion} onEndFluid={noop} onEditGas={noop} onStopAgent={noop} onQuickAdd={noop}
      />
    </CaseSaveStateContext.Provider>,
  )
  return { tree, onManageInfusion }
}

const pill = (tree: ReturnType<typeof render>) =>
  tree.root.findAll(node => typeof node.props?.onPress === "function" && JSON.stringify(node.props.style ?? {}).includes("borderLeftWidth"))[0]

describe("a running infusion in a row after now, on the phone", () => {
  it("is listed there on a live case, and not once the case has ended", () => {
    expect(runningItemsByCol(chart, [row1555], { projectRunning: true }).get(row1555)).toEqual([
      expect.objectContaining({ id: "inf-prop", projected: true }),
    ])
    expect(runningItemsByCol(chart, [row1555]).get(row1555)).toEqual([])
  })

  it("is dashed, and tapping it opens propofol's sheet dated to that row", () => {
    const running = runningItemsByCol(chart, [row1555], { projectRunning: true }).get(row1555)!
    const { tree, onManageInfusion } = row(running)
    const control = pill(tree)
    expect(StyleOf(control).borderStyle).toBe("dashed")
    act(() => { control.props.onPress() })
    expect(onManageInfusion).toHaveBeenCalledWith(propofol, row1555)
  })
})

function StyleOf(node: { props: { style?: unknown } }): Record<string, unknown> {
  const style = node.props.style
  return Array.isArray(style) ? Object.assign({}, ...style) : (style as Record<string, unknown>) ?? {}
}

describe("whether the phone projects at all", () => {
  it("only while the case has not ended", async () => {
    const { buildIntraopTabContentProps } = await import("./buildIntraopTabContentProps")
    const base = { tab: "log", startRef: { current: null }, labResults: [] } as const
    const live = buildIntraopTabContentProps({ ...base, caseEnded: false } as never) as { content: { projectRunning?: boolean } }
    const ended = buildIntraopTabContentProps({ ...base, caseEnded: true } as never) as { content: { projectRunning?: boolean } }
    expect(live.content.projectRunning).toBe(true)
    expect(ended.content.projectRunning).toBe(false)
  })
})

describe("the timetable tab", () => {
  it("passes the rows after now their projected items only when asked to", async () => {
    vi.resetModules()
    const seen = new Map<number, RunningItem[]>()
    // The shared react-native stand-in has no FlatList; one that renders every row is enough here.
    const reactNative = await import("react-native")
    vi.doMock("react-native", () => ({
      ...reactNative,
      FlatList: ({ data, renderItem }: { data: number[]; renderItem: (info: { item: number; index: number }) => React.ReactNode }) =>
        <>{data.map((item, index) => <React.Fragment key={item}>{renderItem({ item, index })}</React.Fragment>)}</>,
    }))
    vi.doMock("./TimetableRow", () => ({
      TimetableRow: (props: { col: number; running: RunningItem[] }) => { seen.set(props.col, props.running); return null },
    }))
    const { IntraopTimetableTab } = await import("./IntraopTimetableTab")
    const noop = () => {}
    const tab = (projectRunning: boolean) => {
      seen.clear()
      render(
        <IntraopTimetableTab
          screenWidth={400} undoEvent={null} chartRows={[row1555]} rowHeight={60} chartStart={start} currentCol={1}
          expandedRow={row1555} nowSlotPercent={0} timetable={chart} eventRows={{}} activeInfusions={[propofol]}
          activeFluids={[]} activeAgents={[]} activeGas={null as never} started projectRunning={projectRunning}
          isWatching={false} listRef={{ current: null }} onUndo={noop} onDismissUndo={noop} onSetExpandedRow={noop}
          eventText={() => ""} buildSummary={() => ({ criticalParts: [], normalParts: [], eventParts: [], drugParts: [], hasCritical: false, hasUnsynced: false }) as never}
          onManageInfusion={noop} onEndFluid={noop} onEditGas={noop} onStopAgent={noop} onQuickAdd={noop} onJumpToNow={noop} onEndCase={noop}
        />,
      )
      return seen.get(row1555)
    }
    expect(tab(true)).toEqual([expect.objectContaining({ id: "inf-prop", projected: true })])
    expect(tab(false)).toEqual([])
    vi.doUnmock("./TimetableRow")
    vi.doUnmock("react-native")
  })
})
