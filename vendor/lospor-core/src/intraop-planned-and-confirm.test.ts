import { describe, expect, it } from "vitest"

import { evaluateCaseFinalization } from "./clinical-validation"
import {
  intraopCanFinalise,
  intraopConfirmStop,
  intraopEndCaseStopIds,
  intraopMoveToEnd,
  intraopUnconfirmedStops,
} from "./intraop-commands"
import { projectIntraopEvents, stopEnteredAhead } from "./intraop-engine"
import { fluidRateAtColumn, gasSettingsAtColumn, rateAtColumn } from "./intraop-summary"
import { timetableEditToEventOps } from "./intraop-timetable-edit"
import { calcInfusionTotal, calculateDeliveredFluidTotals } from "./intraop-totals"
import { parseLegacyKeyEvents, type LogEvent, type TimetableData } from "./intraop-types"

// The time engine in 9.13.0: what is still to come is drawn and counts for
// nothing; a stop dated ahead of its entry is asked about when it arrives.

const start = "2026-09-27T14:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const read = (events: LogEvent[], minutes: number, endedAt?: number) =>
  projectIntraopEvents(events, {
    start,
    openThrough: at(minutes),
    ...(endedAt != null ? { endedAt: at(endedAt) } : {}),
  })

describe("a change dated after now", () => {
  const infusion: LogEvent[] = [
    { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Nitroglycerin", rate: "60", unit: "mcg/min" },
    { id: "r", ts: at(45), type: "infusion_rate", infId: "i", rate: "120", unit: "mcg/min" },
  ]

  it("is drawn as planned and changes neither the rate nor the total", () => {
    const [bar] = read(infusion, 13).infusions
    expect(bar.rateChanges).toEqual([expect.objectContaining({ eventId: "r", col: 9, planned: true })])
    expect(rateAtColumn(bar, 9).rate).toBe(60)
    expect(bar.rate).toBe(60)
    expect(calcInfusionTotal(bar).amount).toBe(60 * 13)
  })

  it("counts from its own minute once that minute has passed", () => {
    const [bar] = read(infusion, 60).infusions
    expect(bar.rateChanges?.[0].planned).toBeUndefined()
    expect(calcInfusionTotal(bar).amount).toBe(60 * 45 + 120 * 15)
  })

  it("is not counted even when it falls in the current five-minute column", () => {
    const [bar] = read([infusion[0], { ...infusion[1], ts: at(14) }], 13).infusions
    expect(bar.endCol).toBe(2)
    expect(bar.rateChanges?.[0]).toMatchObject({ col: 2, planned: true })
    expect(calcInfusionTotal(bar).amount).toBe(60 * 13)
  })

  it("works the same for a fluid rate and a gas setting", () => {
    const chart = read([
      { id: "f", ts: at(0), type: "fluid_start", fluidId: "fl", name: "Ringer", category: "Crystalloids", fluidEntryMode: "RATE", rate: "600", unit: "mL/h" },
      { id: "fr", ts: at(40), type: "fluid_rate", fluidId: "fl", rate: "1200", unit: "mL/h" },
      { id: "g", ts: at(0), type: "gas_start", fgf: 2, carrierGas: "air", fio2: 50 },
      { id: "gc", ts: at(40), type: "gas_change", fgf: 1, carrierGas: "air", fio2: 40 },
    ], 30)
    expect(chart.fluids[0].rateChanges?.[0]).toMatchObject({ planned: true })
    expect(fluidRateAtColumn(chart.fluids[0], 8).rate).toBe(600)
    expect(calculateDeliveredFluidTotals(chart.fluids, at(30)).crystalloids).toBe(300)
    expect(chart.gasSettings?.[0].settingsChanges?.[0]).toMatchObject({ planned: true })
    expect(gasSettingsAtColumn(chart.gasSettings![0], 6)?.fgf).toBe(2)
  })
})

describe("a stop entered ahead of its time", () => {
  // Dragged at 14:13 to stop at 14:43.
  const events: LogEvent[] = [
    { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
    { id: "stop", ts: at(43), recordedAt: at(13), type: "infusion_stop", infId: "i" },
  ]

  it("is planned until its time", () => {
    const [bar] = read(events, 20).infusions
    expect(bar).toMatchObject({ plannedStopCol: 8 })
    expect(bar.stopped).toBeFalsy()
    expect(bar.stopUnconfirmed).toBeUndefined()
  })

  it("then applies, and asks whether it really stopped", () => {
    const [bar] = read(events, 50).infusions
    expect(bar).toMatchObject({ stopped: true, endCol: 8, stopUnconfirmed: true })
    expect(intraopUnconfirmedStops(events, at(50)).map(event => event.id)).toEqual(["stop"])
  })

  it("stops asking once confirmed", () => {
    const confirmed = events.map(event => event.id === "stop" ? intraopConfirmStop(event) : event)
    expect(read(confirmed, 50).infusions[0].stopUnconfirmed).toBeUndefined()
    expect(intraopUnconfirmedStops(confirmed, at(50))).toEqual([])
  })

  it("is not asked about when it was entered at its own time, or saved before 9.13.0", () => {
    expect(stopEnteredAhead({ ts: at(20), recordedAt: at(20) })).toBe(false)
    expect(stopEnteredAhead({ ts: at(20), recordedAt: at(19.5) })).toBe(false)
    expect(stopEnteredAhead({ ts: at(20) })).toBe(false)
    // Charted late: dated before it was entered.
    expect(stopEnteredAhead({ ts: at(20), recordedAt: at(35) })).toBe(false)
  })

  it("blocks finalising while unconfirmed", () => {
    expect(intraopCanFinalise(events, at(60))).toBe(false)
    const result = evaluateCaseFinalization({
      intraop: { startedAt: start, endedAt: at(60), keyEvents: { log: events } },
    } as Parameters<typeof evaluateCaseFinalization>[0])
    expect(result.issues.map(issue => issue.code)).toContain("unconfirmed_stops")
  })
})

describe("an entry after the end, marked as having happened", () => {
  it("moves to the end, and a stop moved there is one Resume offers to remove", () => {
    const stop: LogEvent = { id: "stop", ts: at(45), recordedAt: at(13), type: "infusion_stop", infId: "i" }
    const moved = intraopMoveToEnd(stop, at(30))
    expect(moved).toMatchObject({ ts: at(30), endCaseStop: true })
    expect(intraopEndCaseStopIds([moved])).toEqual(["stop"])
    const drug: LogEvent = { id: "d", ts: at(45), type: "drug", name: "Ondansetron", dose: "4", unit: "mg" }
    expect(intraopMoveToEnd(drug, at(30)).endCaseStop).toBeUndefined()
  })
})

describe("web chart edits", () => {
  const log: LogEvent[] = [
    { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Propofol", rate: "6", unit: "mg/kg/hr" },
    { id: "stop", ts: at(20), recordedAt: at(5), stopConfirmed: true, type: "infusion_stop", infId: "i" },
  ]

  it("record when each change was entered, and a moved stop is a new guess", () => {
    const before = read(log, 13)
    const after = JSON.parse(JSON.stringify(before)) as TimetableData
    after.infusions = after.infusions.map(bar => ({ ...bar, plannedStopCol: 9 }))
    const ops = timetableEditToEventOps({ log, before, after, chartStart: start, now: at(13), newId: () => "n" })
    const stop = ops.update.find(event => event.id === "stop")
    expect(stop).toMatchObject({ ts: at(45), recordedAt: at(13) })
    expect(stop?.stopConfirmed).toBeUndefined()
  })
})

describe("a saved chart read back", () => {
  it("keeps the instants, the recorded basis, the planned marks and the event links", () => {
    const chart = read([
      { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Propofol", rate: "6", unit: "mg/kg/hr", calculationBasis: "TBW" },
      { id: "r", ts: at(40), type: "infusion_rate", infId: "i", rate: "4", unit: "mg/kg/hr" },
      { id: "e", ts: at(50), recordedAt: at(10), type: "infusion_stop", infId: "i" },
    ], 20)
    const [bar] = parseLegacyKeyEvents(JSON.parse(JSON.stringify(chart))).infusions ?? []
    expect(bar).toMatchObject({
      startTs: at(0), calculationBasis: "TBW", startEventId: "s", stopEventId: "e", plannedStopCol: 10,
    })
    expect(bar.rateChanges?.[0]).toMatchObject({ eventId: "r", ts: at(40), planned: true })
  })
})

describe("entry times on the PWA's own edits", () => {
  it("stamp new and re-timed events, and a re-timed stop loses its confirmation", async () => {
    const { stampEnteredEvents } = await import("./intraop-commands")
    const previous: LogEvent[] = [
      { id: "s", ts: at(0), recordedAt: at(0), type: "infusion_start", infId: "i", name: "Propofol", rate: "6", unit: "mg/kg/hr" },
      { id: "stop", ts: at(20), recordedAt: at(5), stopConfirmed: true, type: "infusion_stop", infId: "i" },
    ]
    const next: LogEvent[] = [
      previous[0],
      { ...previous[1], ts: at(40) },
      { id: "d", ts: at(12), type: "drug", name: "Ondansetron", dose: "4", unit: "mg" },
    ]
    const stamped = stampEnteredEvents(previous, next, at(13))
    expect(stamped[0]).toBe(previous[0])
    expect(stamped[1]).toMatchObject({ ts: at(40), recordedAt: at(13) })
    expect(stamped[1].stopConfirmed).toBeUndefined()
    expect(stamped[2]).toMatchObject({ recordedAt: at(13) })
  })
})

describe("rows on the PWA chart", () => {
  it("show a planned change in its own row with its new rate, and an unconfirmed stop in the stop's row", async () => {
    const { runningItemsByColumn } = await import("./intraop-summary")
    const chart = read([
      { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Nitroglycerin", rate: "60", unit: "mcg/min" },
      { id: "r", ts: at(45), type: "infusion_rate", infId: "i", rate: "120", unit: "mcg/min" },
      { id: "s2", ts: at(0), type: "infusion_start", infId: "j", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
      { id: "stop", ts: at(10), recordedAt: at(2), type: "infusion_stop", infId: "j" },
    ], 13)
    const rows = runningItemsByColumn(chart, [2, 9])
    expect(rows.get(9)).toEqual([expect.objectContaining({ name: "Nitroglycerin", rate: 120, plannedChange: true })])
    expect(rows.get(2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Remifentanil", stopUnconfirmed: true, stopEventId: "stop" }),
      expect.objectContaining({ name: "Nitroglycerin", rate: 60 }),
    ]))
  })
})
