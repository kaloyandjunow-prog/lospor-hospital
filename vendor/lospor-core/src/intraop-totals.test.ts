import { describe, expect, it } from "vitest"

import {
  calculateDeliveredFluidTotals,
  calculateFluidTotals,
  fluidTotalsPatch,
  infusionLocalAnaestheticMg,
  localAnaestheticMg,
  parseLocalAnaestheticPercent,
} from "./intraop-totals"

describe("delivered fluid totals", () => {
  const start = "2026-09-01T08:00:00.000Z"
  const halfAnHourLater = "2026-09-01T08:30:00.000Z"

  it("counts a still-running rate infusion, which the stored volume does not", () => {
    // The stored `volume` is only written when a fluid is stopped, so a
    // running crystalloid reads as 0 there. A clinician asking "how much have
    // I given" mid-case must not be told nothing.
    const running = [{
      category: "Crystalloids",
      volume: "0",
      fluidEntryMode: "RATE" as const,
      startTs: start,
      rate: 1000, // mL/h
    }]

    expect(calculateFluidTotals(
      running.map(f => ({ id: "a", volume: f.volume, category: f.category, startCol: 0 })),
    ).crystalloids).toBe(0)

    expect(calculateDeliveredFluidTotals(running, halfAnHourLater).crystalloids).toBe(500)
  })

  it("stops counting a fluid once it has ended", () => {
    const stopped = [{
      category: "Colloids",
      volume: "0",
      fluidEntryMode: "RATE" as const,
      startTs: start,
      endTs: halfAnHourLater,
      rate: 1000,
    }]

    expect(calculateDeliveredFluidTotals(stopped, "2026-09-01T12:00:00.000Z").colloids).toBe(500)
  })

  it("uses a bag's volume directly and keeps categories apart", () => {
    const totals = calculateDeliveredFluidTotals([
      { category: "Crystalloids", volume: "500", fluidEntryMode: "VOLUME", bagVolumeMl: 500 },
      { category: "Blood products", volume: "250", fluidEntryMode: "VOLUME", bagVolumeMl: 250 },
    ], halfAnHourLater)

    expect(totals).toEqual({ crystalloids: 500, colloids: 0, blood: 250 })
  })
})

describe("local anaesthetic mg equivalent", () => {
  it("reads the percentage out of the preparation name", () => {
    expect(parseLocalAnaestheticPercent("Bupivacaine 0.25%")).toBe(0.25)
    expect(parseLocalAnaestheticPercent("Lidocaine 2%")).toBe(2)
    expect(parseLocalAnaestheticPercent("Propofol")).toBeNull()
  })

  it("converts millilitres to milligrams at 10 mg/mL per percent", () => {
    // A 1% solution is 10 mg/mL, so 20 mL of 0.5% is 100 mg.
    expect(localAnaestheticMg(20, 0.5)).toBe(100)
    expect(localAnaestheticMg(10, 2)).toBe(200)
  })

  it("only converts a percentage-strength infusion measured in millilitres", () => {
    expect(infusionLocalAnaestheticMg("Ropivacaine 0.2%", 50, "mL")).toBe(100)
    expect(infusionLocalAnaestheticMg("Ropivacaine 0.2%", 50, "mg")).toBeNull()
    expect(infusionLocalAnaestheticMg("Noradrenaline", 50, "mL")).toBeNull()
  })
})

describe("canonical fluid totals", () => {
  it("uses projected final volumes and keeps database totals integer-safe", () => {
    const totals = calculateFluidTotals([
      { id: "a", volume: "12.6", category: "Crystalloids", startCol: 0 },
      { id: "b", volume: "7.4", category: "Crystalloids", startCol: 1 },
      { id: "c", volume: "99.5", category: "Blood products", startCol: 2 },
      { id: "invalid", volume: "-10", category: "Colloids", startCol: 3 },
    ])
    expect(totals).toEqual({ crystalloids: 20, colloids: 0, blood: 100 })
    expect(fluidTotalsPatch(totals)).toEqual({
      crystalloidsMl: 20,
      colloidsMl: null,
      bloodMl: 100,
    })
  })
})
