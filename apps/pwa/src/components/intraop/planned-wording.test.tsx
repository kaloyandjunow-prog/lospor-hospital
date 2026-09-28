import React from "react"
import { describe, expect, it, vi } from "vitest"

// A change planned from a row after now said nowhere when it was for: not on
// the sheet, not in the note after it, not in the closed row (1.4.14
// appliance test, case 2026-0020, propofol 8 -> 10 planned for 14:35).

const words: Record<string, string> = {
  plannedAtTime: "at {time}",
  changeTo: "Change to {value}",
  trStop: "Stop",
  trRowInfusion: "Infusion",
  currentLabel: "Current",
  ubItemAdded: "{text} added",
  ubItemPlanned: "{text} planned for {time}",
  plannedChangeLabel: "Change planned",
  plannedLabel: "Planned",
  plannedStopLabel: "Stop planned",
}
vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => words[key] ?? key, t: (key: string) => key, language: "en" }),
}))

import { projectIntraopEvents } from "@lospor/core/intraop-engine"
import type { TimetableData } from "@/components/IntraopTimetable"
import type { ActiveInfusion, LogEvent } from "@/lib/intraop-log-event"
import { plannedRowTime, formatDateHHMM } from "@/lib/intraop-projection"
import { runningItemsByCol, type RunningItem } from "@/lib/intraop-running"
import { CaseSaveStateContext, type CaseSaveState } from "@/lib/use-case-save-state"
import { render } from "@/test/render"
import { InfusionActionSheet } from "./InfusionActionSheet"
import { IntraopUndoBar } from "./IntraopUndoBar"
import { TimetableRow } from "./TimetableRow"

const texts = (tree: ReturnType<typeof render>) =>
  tree.root.findAll(node => String(node.type) === "Text")
    .map(node => node.children.map(child => typeof child === "string" ? child : "").join(""))
    .filter(Boolean)

const propofol = { infId: "prop", name: "Propofol", rate: "8", unit: "mg/kg/hr", color: "#8b5cf6" } as ActiveInfusion

describe("which row time is named", () => {
  it("a row after now, not now or the past", () => {
    const now = new Date("2026-09-28T11:17:00.000Z")
    const later = "2026-09-28T11:35:00.000Z"
    expect(plannedRowTime(later, now)).toBe(formatDateHHMM(new Date(later)))
    expect(plannedRowTime("2026-09-28T11:15:00.000Z", now)).toBeNull()
    expect(plannedRowTime(null, now)).toBeNull()
  })
})

describe("the rate sheet opened from a later row", () => {
  const sheet = (plannedAt: string | null) => render(
    <InfusionActionSheet
      visible onClose={() => {}} target={propofol} ratePresets={{}} newRate="10" setNewRate={() => {}}
      onChangeRate={() => {}} onStop={() => {}} plannedAt={plannedAt}
    />,
  )

  it("names the time in its title and on both actions", () => {
    const shown = texts(sheet("14:35")).join(" | ")
    expect(shown).toContain("Change to 10 mg/kg/hr at 14:35")
    expect(shown).toContain("at 14:35")
    expect(shown).toMatch(/Stop infusion.*at 14:35/)
  })

  it("names no time for a change now", () => {
    const shown = texts(sheet(null)).join(" | ")
    expect(shown).toContain("Change to 10 mg/kg/hr")
    expect(shown).not.toContain("at ")
  })
})

describe("the note after it", () => {
  it("says planned for the time, or added", () => {
    const planned = render(<IntraopUndoBar text="Propofol → 10 mg/kg/hr" plannedAt="14:35" onUndo={() => {}} onDismiss={() => {}} />)
    expect(texts(planned)).toContain("Propofol → 10 mg/kg/hr planned for 14:35")
    const added = render(<IntraopUndoBar text="Propofol → 10 mg/kg/hr" onUndo={() => {}} onDismiss={() => {}} />)
    expect(texts(added)).toContain("Propofol → 10 mg/kg/hr added")
  })
})

describe("the closed row of a planned change", () => {
  const start = new Date("2026-09-28T10:30:00.000Z")
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString()
  const saved: CaseSaveState = { queuedEventIds: [], sendingEventId: null, refused: [], queuedSections: [], dismissRefused: () => {} }
  const closedRow = (running: RunningItem[], col: number) => render(
    <CaseSaveStateContext.Provider value={saved}>
      <TimetableRow
        col={col} chartStart={start} rowHeight={60}
        isNow={false} isQuarter={false} isExpanded={false} nowSlotPercent={0}
        rowEvents={[]} running={running}
        summary={{ criticalParts: [], normalParts: [], eventParts: [], drugParts: [], hasCritical: false, hasUnsynced: false } as never}
        labelOf={() => ""} activeInfusions={[propofol]} activeFluids={[]} activeAgents={[]} activeGas={null as never}
        onExpand={() => {}} onCollapse={() => {}} onManageInfusion={() => {}} onEndFluid={() => {}} onEditGas={() => {}} onStopAgent={() => {}} onQuickAdd={() => {}}
      />
    </CaseSaveStateContext.Provider>,
  )
  const log = [
    { id: "p", ts: at(5), type: "infusion_start", infId: "prop", name: "Propofol", rate: "8", unit: "mg/kg/hr", color: "#8b5cf6" },
    { id: "c", ts: at(65), type: "infusion_rate", infId: "prop", rate: "10" },
  ] as LogEvent[]
  const chart = projectIntraopEvents(log as never, { start: start.toISOString(), openThrough: at(47) }) as unknown as TimetableData

  it("says what is planned there without being opened", () => {
    const running = runningItemsByCol(chart, [13], { projectRunning: true }).get(13)!
    const shown = texts(closedRow(running, 13)).join(" | ")
    expect(shown).toContain("Change planned · ")
    expect(shown).toContain("Propofol")
  })

  it("says nothing of the kind in a row where nothing is planned", () => {
    const running = runningItemsByCol(chart, [11], { projectRunning: true }).get(11)!
    expect(texts(closedRow(running, 11)).join(" | ")).not.toContain("planned")
  })
})

describe("the screen hands the row time on", () => {
  it("to the rate sheet, from the row it was opened for", async () => {
    const { buildIntraopMedicationSheetProps } = await import("./buildIntraopMedicationSheetProps")
    const later = new Date(Date.now() + 30 * 60_000).toISOString()
    const props = (infActTs: string | null) => (buildIntraopMedicationSheetProps(new Proxy({ infActTs } as Record<string, unknown>, {
      get: (known, key) => key in known ? known[key as string] : (key === "tc" || key === "t" ? (k: string) => k : () => undefined),
    }) as never) as unknown as {
      infusionAction: { plannedAt: string | null }
    }).infusionAction.plannedAt
    expect(props(later)).toBe(formatDateHHMM(new Date(later)))
    expect(props(null)).toBeNull()
  })
})
