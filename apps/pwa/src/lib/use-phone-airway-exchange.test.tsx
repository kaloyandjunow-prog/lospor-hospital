import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { usePhoneAirwayExchange } from "./use-phone-airway-exchange"

// An answer saved from a suggestion can name the airway; the list on the phone takes it in the same moment (2026-11-11).

type Exchange = ReturnType<typeof usePhoneAirwayExchange>
function Probe({ log, grab }: { log: LogEvent[]; grab: (exchange: Exchange) => void }) {
  grab(usePhoneAirwayExchange({ log, active: true, legacy: () => ({}), persist: vi.fn() }))
  return null
}
const induction = (id: string, at: string, entries: unknown[]) =>
  ({ id, ts: at, type: "clinical_event", label: "Induction", recordedAt: at, intraopPatch: { airwayDeviceEntries: entries } }) as unknown as LogEvent
const tube = { id: "airway-1", device: "ORAL_ETT", status: "in_use", details: { oralTubeSize: 7.5, oralCuffed: true }, insertedAt: "2026-11-11T19:43:14.636Z" }

describe("the airway list follows an answer that names the airway", () => {
  it("takes the list from an event that arrives after the screen opened", () => {
    let exchange!: Exchange
    const view = render(<Probe log={[]} grab={e => { exchange = e }} />)
    expect(exchange.entries()).toEqual([])
    act(() => view.update(<Probe log={[induction("i1", "2026-11-11T19:43:14.636Z", [tube])]} grab={e => { exchange = e }} />))
    expect(exchange.entries().map(entry => entry.device)).toEqual(["ORAL_ETT"])
  })

  it("does not apply what was already in the log when the screen opened (the stored list was read from the case)", () => {
    let exchange!: Exchange
    render(<Probe log={[induction("i0", "2026-11-11T19:00:00.000Z", [tube])]} grab={e => { exchange = e }} />)
    expect(exchange.entries()).toEqual([])
  })

  it("lets the latest answer win", () => {
    let exchange!: Exchange
    const view = render(<Probe log={[]} grab={e => { exchange = e }} />)
    const second = { ...tube, id: "airway-2", device: "LMA", details: { lmaSize: 4 } }
    act(() => view.update(<Probe log={[induction("i2", "2026-11-11T19:50:00.000Z", [second]), induction("i1", "2026-11-11T19:43:00.000Z", [tube])]} grab={e => { exchange = e }} />))
    expect(exchange.entries().map(entry => entry.device)).toEqual(["LMA"])
  })
})
