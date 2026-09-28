// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { projectIntraopEvents } from "@lospor/core/intraop-engine"
import type { LogEvent } from "@lospor/core/intraop-types"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))
vi.mock("./ui-copy", () => ({
  useIntraopUiCopy: () => ({ infusion: new Proxy({}, { get: (_t, key) => String(key) }) }),
}))

import { InfusionLane } from "./TimetableInfusionLane"

// A running infusion in the cells after now, on the web chart (9.13.1): the
// same Core rule as the PWA's rows. Propofol runs at 4 mg/kg/h from 14:45;
// at 14:50 the 15:55 cell continues it, dashed, and a click opens propofol's
// own menu dated to that cell.

afterEach(cleanup)

const start = "2026-09-28T11:45:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const propofol: LogEvent = { id: "p", ts: at(0), type: "infusion_start", infId: "prop", name: "Propofol", rate: "4", unit: "mg/kg/hr" }
const cell1555 = 14

function lane(events: LogEvent[], projectRunning: boolean) {
  const segments = projectIntraopEvents(events, { start, openThrough: at(5) }).infusions
  const onOpenMenu = vi.fn()
  render(
    <InfusionLane
      drugName="Propofol" color="#8b5cf6" segments={segments} labelWidth={80}
      rowCols={Array.from({ length: 16 }, (_, index) => index)} colStart={0} colEnd={16} colW={30} nowCol={1}
      sel={null} setSel={() => {}} clearSel={() => {}} displayInfusionName={name => name}
      discConfirmId={null} setDiscConfirmId={() => {}} hoverDiscontinue={null}
      drag={{ movingInf: null, movingInfCol: null, movingRatePill: null, extendingInf: null, extInfHover: null, extendingInfLeft: null, extInfLeftHover: null } as never}
      dragActions={new Proxy({}, { get: () => () => {} }) as never}
      extendInfusion={() => {}} extendInfusionLeft={() => {}} applyInfRateChange={() => {}} onMoveBar={() => {}}
      onOpenMenu={onOpenMenu} projectRunning={projectRunning}
    />,
  )
  return onOpenMenu
}

describe("a running infusion in the cells after now, on the web", () => {
  it("runs on, dashed, in every later cell of a live case", () => {
    lane([propofol], true)
    // Now is cell 1; the bar is drawn to it, and cells 2..15 continue it.
    expect(screen.getAllByTestId("infusion-runs-on")).toHaveLength(14)
  })

  it("does not run on for an ended case, or after its planned stop", () => {
    lane([propofol], false)
    expect(screen.queryAllByTestId("infusion-runs-on")).toHaveLength(0)
    cleanup()
    lane([propofol, { id: "s", ts: at(40), type: "infusion_stop", infId: "prop" }], true)
    // Cells 2..7 run on; 8 holds the planned stop; nothing after.
    expect(screen.getAllByTestId("infusion-runs-on")).toHaveLength(6)
  })

  it("a click opens that infusion's menu dated to the clicked cell", () => {
    const onOpenMenu = lane([propofol], true)
    fireEvent.click(screen.getAllByTestId("infusion-runs-on")[cell1555 - 2])
    expect(onOpenMenu).toHaveBeenCalledWith(expect.objectContaining({ segId: "prop", name: "Propofol", stopped: false, fromPillCol: cell1555 }))
  })
})
