import { describe, expect, it } from "vitest"
import { projectIntraopEvents } from "@lospor/core/intraop-engine"
import { formatInfusionTotal } from "@lospor/core/intraop-totals"
import type { LegacyKeyEvents, LogEvent } from "@lospor/core/intraop-types"

import { calcInfTotals } from "./print-infusion-totals"

// The printed record's infusion totals (9.12.3). Case 2026-0010 printed
// "Remifentanil 2.5 mcg" for 0.1 mcg/kg/min over 25 minutes in an 85 kg
// patient: the sheet passed no weight, so the calculation used 1 kg.

const start = "2026-09-27T14:43:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const log: LogEvent[] = [
  { id: "remi", ts: at(5), type: "infusion_start", infId: "i", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
  { id: "stop", ts: at(30), type: "infusion_stop", infId: "i" },
]

/** The chart as saved before 9.12.3: no instants on the bar, the log beside it. */
function savedChart(): LegacyKeyEvents {
  const chart = projectIntraopEvents(log, { start: "2026-09-27T14:40:00.000Z", endedAt: at(31) })
  return {
    ...chart,
    infusions: chart.infusions.map(({ startTs: _start, endTs: _end, ...bar }) => bar),
    log,
  }
}

describe("printed infusion totals", () => {
  it("use the patient's weight and the time actually run", () => {
    // Remifentanil is dosed on ideal weight: 0.1 × 75 kg × 25 min.
    const [remifentanil] = calcInfTotals(savedChart(), { ibw: 75, tbw: 85, heightCm: 180, endedAt: at(31) })
    expect(formatInfusionTotal(remifentanil)).toBe("187.5 mcg")
  })

  it("say when a stop entered ahead of its time is not yet confirmed", () => {
    const ahead = log.map(event => event.id === "stop" ? { ...event, recordedAt: at(10) } : event)
    const chart = { ...savedChart(), log: ahead }
    expect(calcInfTotals(chart, { ibw: 75, tbw: 85, endedAt: at(31) })[0].stopUnconfirmed).toBe(true)
    expect(calcInfTotals(savedChart(), { ibw: 75, tbw: 85, endedAt: at(31) })[0].stopUnconfirmed).toBe(false)
  })

  it("say per kilogram when no weight was recorded, never a 1 kg total", () => {
    const [remifentanil] = calcInfTotals(savedChart(), { endedAt: at(31) })
    expect(formatInfusionTotal(remifentanil)).toBe("2.5 mcg/kg")
  })
})
