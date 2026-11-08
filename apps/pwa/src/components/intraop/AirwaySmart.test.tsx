import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import type { AirwayDeviceEntry } from "@lospor/core/airway-device-entries"

const setAirwayScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, language: "en", airwayScreen: "smart", setAirwayScreen }),
}))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"
import { AirwayScreenCard } from "@/components/settings/AirwayScreenCard"
import { AirwaySmart } from "./AirwaySmart"

const START = "2026-11-02T09:30:00.000Z"
const NOW = "2026-11-02T09:55:00.000Z"
const ADULT = { clinicalMode: "ADULT" as const, ageYears: 45, weightKg: 82, heightCm: 182, sex: "MALE" }
const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
const present = (tree: ReturnType<typeof render>, id: string) => byId(tree, id) !== undefined

function setup(overrides: Partial<Parameters<typeof AirwaySmart>[0]> = {}) {
  const onChange = vi.fn()
  const tree = render(
    <AirwaySmart entries={[]} onChange={onChange} patient={ADULT} techniques={["GENERAL_TIVA"]} startedAt={START} now={() => NOW} timeZone="UTC"
      difficultAirway={false} deviceLabel={code => code} toolLabel={code => code}
      describe={entry => `${entry.device} ${entry.details.oralTubeSize ?? ""}`.trim()} timeOf={iso => iso.slice(11, 16)} {...overrides} />,
  )
  return { tree, onChange }
}

describe("Smart selection, the Airway tab on the phone (10.2.0)", () => {
  it("leads with the tube, the LMA and the mask, with the other devices behind one disclosure", () => {
    const { tree } = setup()
    for (const device of ["ORAL_ETT", "LMA", "FACE_MASK"]) expect(present(tree, `airway-smart-card-${device}`)).toBe(true)
    act(() => { byId(tree, "airway-smart-more")!.props.onPress() })
    for (const device of ["NASAL_ETT", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE", "SURGICAL_AIRWAY", "OPA", "NPA"]) expect(present(tree, `airway-smart-other-${device}`)).toBe(true)
  })

  it("opens the panel with this patient's size and cuff and adds the tube at the start of anaesthesia, with its tools", () => {
    const onEvent = vi.fn()
    const { tree, onChange } = setup({ onEvent })
    act(() => { byId(tree, "airway-smart-card-ORAL_ETT")!.props.onPress() })
    expect(present(tree, "airway-smart-panel")).toBe(true)
    act(() => { byId(tree, "airway-smart-how-BOUGIE")!.props.onPress() })
    act(() => { byId(tree, "airway-smart-add")!.props.onPress() })
    const next = onChange.mock.calls[0]![0] as AirwayDeviceEntry[]
    expect(next[0]).toMatchObject({ device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: START, instruments: ["BOUGIE"], status: "in_use" })
    const event = onEvent.mock.calls[0]![0]
    expect(event).toMatchObject({ label: "Intubated", ts: START, intraopPatch: expect.objectContaining({ airwayDeviceEntries: expect.any(Array) }) })
    expect(next[0]!.sourceEventId).toBe(event.id)
    expect(event.id).toEqual(expect.any(String))
  })

  it("takes a picked size and the time now", () => {
    const { tree, onChange } = setup()
    act(() => { byId(tree, "airway-smart-card-ORAL_ETT")!.props.onPress() })
    act(() => { byId(tree, "airway-smart-oralTubeSize-7.5")!.props.onPress() })
    act(() => { byId(tree, "airway-smart-time-now")!.props.onPress() })
    act(() => { byId(tree, "airway-smart-add")!.props.onPress() })
    expect((onChange.mock.calls[0]![0] as AirwayDeviceEntry[])[0]).toMatchObject({ details: { oralTubeSize: 7.5, oralCuffed: true }, insertedAt: NOW })
  })

  it("does not silently use now when the anesthesia start is missing", () => {
    const { tree, onChange } = setup({ startedAt: null })
    act(() => { byId(tree, "airway-smart-card-ORAL_ETT")!.props.onPress() })
    expect(present(tree, "airway-smart-time-missing")).toBe(true)
    expect(byId(tree, "airway-smart-add")!.props.disabled).toBe(true)
    act(() => { byId(tree, "airway-smart-time-now")!.props.onPress() })
    act(() => { byId(tree, "airway-smart-add")!.props.onPress() })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("requires an exchange reason before adding a second active primary airway", () => {
    const first: AirwayDeviceEntry = { id: "a1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: START, status: "in_use" }
    const onEvent = vi.fn()
    const { tree } = setup({ entries: [first], onEvent })
    act(() => { byId(tree, "airway-smart-card-LMA")!.props.onPress() })
    expect(present(tree, "airway-smart-active-conflict")).toBe(true)
    expect(byId(tree, "airway-smart-add")!.props.disabled).toBe(true)
    act(() => { byId(tree, "airway-smart-why-planned")!.props.onPress() })
    act(() => { byId(tree, "airway-smart-add")!.props.onPress() })
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Airway exchange", ts: START }))
  })

  it("Reintubate keeps both tubes: the first failed, the second in use", () => {
    const first: AirwayDeviceEntry = { id: "a1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: START, status: "in_use" }
    const onEvent = vi.fn()
    const { tree, onChange } = setup({ entries: [first], onEvent })
    act(() => { byId(tree, "airway-smart-reintubate-a1")!.props.onPress() })
    act(() => { byId(tree, "airway-smart-add")!.props.onPress() })
    const next = onChange.mock.calls[0]![0] as AirwayDeviceEntry[]
    expect(next.map(entry => entry.status)).toEqual(["failed", "in_use"])
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Reintubation", ts: NOW, intraopPatch: expect.objectContaining({ airwayDeviceEntries: expect.any(Array) }) }))
  })

  it("does not call a failed first attempt a reintubation when chosen directly", () => {
    const first: AirwayDeviceEntry = { id: "a1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: START, status: "failed" }
    const onEvent = vi.fn()
    const { tree } = setup({ entries: [first], onEvent })
    act(() => { byId(tree, "airway-smart-card-ORAL_ETT")!.props.onPress() })
    act(() => { byId(tree, "airway-smart-add")!.props.onPress() })
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Intubated", ts: START, intraopPatch: expect.objectContaining({ airwayDeviceEntries: expect.any(Array) }) }))
  })

  it("offers an explicit remove action for a recorded device", () => {
    const entry: AirwayDeviceEntry = { id: "a1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: START, status: "in_use" }
    const onRemove = vi.fn()
    const { tree } = setup({ entries: [entry], onRemove })
    act(() => { byId(tree, "airway-smart-remove-a1")!.props.onPress() })
    expect(onRemove).toHaveBeenCalledWith(entry, [])
  })

  it("says so when nothing is in place yet, and leads with what keeps the airway open for sedation", () => {
    const { tree } = setup({ techniques: ["SEDATION_DEEP"] })
    expect(present(tree, "airway-smart-empty")).toBe(true)
    expect(present(tree, "airway-smart-card-NPA")).toBe(true)
    expect(present(tree, "airway-smart-card-ORAL_ETT")).toBe(false)
  })
})

describe("Smart selection opens from the timeline on the phone", () => {
  it("opens the panel for Intubated, LMA in and DLT placed charted here, once, with that time", () => {
    let api: ReturnType<typeof usePhoneAirwayExchange> | null = null
    function Probe({ log, smart }: { log: LogEvent[]; smart: boolean }) {
      api = usePhoneAirwayExchange({ log, active: true, smart, legacy: () => ({}), persist: vi.fn() })
      return null
    }
    const tree = render(<Probe log={[]} smart />)
    const at = new Date().toISOString()
    const event = { id: "e1", ts: at, type: "clinical_event", label: "LMA in", recordedAt: at } as LogEvent
    act(() => { tree.update(<Probe log={[event]} smart />) })
    expect(api!.smartOpen).toMatchObject({ device: "LMA", at, eventId: "e1", eventLabel: "LMA in" })
    act(() => { api!.setSmartOpen(null) })
    act(() => { tree.update(<Probe log={[event]} smart />) })
    expect(api!.smartOpen).toBeNull()
  })

  it("does nothing when the clinician uses the legacy tab", () => {
    let api: ReturnType<typeof usePhoneAirwayExchange> | null = null
    function Probe({ log }: { log: LogEvent[] }) {
      api = usePhoneAirwayExchange({ log, active: true, smart: false, legacy: () => ({}), persist: vi.fn() })
      return null
    }
    const tree = render(<Probe log={[]} />)
    const at = new Date().toISOString()
    act(() => { tree.update(<Probe log={[{ id: "e1", ts: at, type: "clinical_event", label: "Intubated", recordedAt: at } as LogEvent]} />) })
    expect(api!.smartOpen).toBeNull()
  })
})

describe("the Airway tab setting on the phone", () => {
  it("offers Smart selection and Legacy, and saves the one picked", () => {
    const tree = render(<AirwayScreenCard />)
    expect(present(tree, "airway-screen-smart")).toBe(true)
    act(() => { byId(tree, "airway-screen-legacy")!.props.onPress() })
    expect(setAirwayScreen).toHaveBeenCalledWith("legacy")
  })
})
