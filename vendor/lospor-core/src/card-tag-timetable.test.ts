import { describe, expect, it } from "vitest"
import { projectIntraopEvents } from "./intraop-engine"
import { applyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import type { LogEvent, TimetableData } from "./intraop-types"
import { cardSuggestionTag } from "./intraop-suggestions/waiting"

/**
 * A gas change or a shock made from a treatment card (10.2.0) must reach the saved log carrying the card's tag, as a
 * dose does: so the export can flag it as taken from a suggestion, and a card is only closed by what was done for it.
 * The web draws gas and shocks on a chart and saves the difference, so the tag has to survive that round trip.
 */

const start = "2026-11-08T08:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const now = at(32)
const tag = cardSuggestionTag("Hypoxia / desaturation", "oxygen")

const log: LogEvent[] = [
  { id: "g1", ts: at(0), type: "gas_start", fgf: 2, carrierGas: "air", fio2: 40 },
]
let n = 0
function edit(change: (chart: TimetableData) => TimetableData, from: LogEvent[] = log) {
  const before = projectIntraopEvents(from, { start, openThrough: now })
  const after = change(JSON.parse(JSON.stringify(before)) as TimetableData)
  const ops = timetableEditToEventOps({ log: from, before, after, chartStart: start, now, newId: () => `new-${++n}` })
  return { ops, next: applyIntraopEventOps(from, ops) }
}

describe("the card tag on a gas change", () => {
  it("is written on the gas_change event the chart edit makes", () => {
    const { ops } = edit(chart => {
      const run = chart.gasSettings![0]!
      run.settingsChanges = [...(run.settingsChanges ?? []), { col: 3, fgf: 4, carrierGas: "o2", fio2: 100, suggestion: tag }]
      return chart
    })
    const change = ops.add.find(event => event.type === "gas_change")
    expect(change).toMatchObject({ fio2: 100, suggestion: tag })
  })

  it("comes back on the chart after a reload, and an untagged change stays untagged", () => {
    const saved: LogEvent[] = [...log,
      { id: "g2", ts: at(15), type: "gas_change", fgf: 4, carrierGas: "o2", fio2: 100, suggestion: tag },
      { id: "g3", ts: at(25), type: "gas_change", fgf: 2, carrierGas: "air", fio2: 50 }]
    const run = projectIntraopEvents(saved, { start, openThrough: now }).gasSettings![0]!
    const tags = (run.settingsChanges ?? []).map(change => change.suggestion)
    expect(tags).toEqual([tag, undefined])
  })

  it("is written on a gas run started from a card", () => {
    const { ops } = edit(chart => ({ ...chart, gasSettings: [{ id: "run", startCol: 1, endCol: 1, fgf: 6, carrierGas: "o2", fio2: 100, suggestion: tag }] }), [])
    expect(ops.add.find(event => event.type === "gas_start")).toMatchObject({ fio2: 100, suggestion: tag })
  })

  it("is kept when an existing tagged change is edited, and does not appear on its neighbours", () => {
    const saved: LogEvent[] = [...log, { id: "g2", ts: at(15), type: "gas_change", fgf: 4, carrierGas: "o2", fio2: 100, suggestion: tag }]
    const { next } = edit(chart => {
      chart.gasSettings![0]!.settingsChanges![0]!.fgf = 6
      return chart
    }, saved)
    expect(next.find(event => event.id === "g2")).toMatchObject({ fgf: 6, suggestion: tag })
    expect(next.find(event => event.id === "g1")?.suggestion).toBeUndefined()
  })
})

describe("the card tag on a shock", () => {
  it("is written on the defibrillation event and comes back on the marker", () => {
    const { ops } = edit(chart => ({
      ...chart,
      clinicalEvents: [...(chart.clinicalEvents ?? []), { colIdx: 4, label: "Defibrillation", color: "#f59e0b", kind: "defibrillation" as const, energyJ: 200, synchronized: false, suggestion: cardSuggestionTag("Ventricular fibrillation", "shock") }],
    }))
    const shock = ops.add.find(event => event.type === "defibrillation")
    expect(shock).toMatchObject({ energyJ: 200, suggestion: "card:Ventricular fibrillation:shock" })
    const marker = projectIntraopEvents([...log, { ...shock!, id: "s1" }], { start, openThrough: now }).clinicalEvents!.find(event => event.kind === "defibrillation")
    expect(marker?.suggestion).toBe("card:Ventricular fibrillation:shock")
  })
})
