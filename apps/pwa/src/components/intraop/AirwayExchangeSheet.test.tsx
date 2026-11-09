import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import type { AirwayDeviceEntry } from "@lospor/core/airway-device-entries"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: "en" }) }))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"
import { AirwayExchangeSheet } from "./AirwayExchangeSheet"

const at = "2026-11-02T10:30:00.000Z"
const tube: AirwayDeviceEntry = { id: "a", device: "ORAL_ETT", details: { oralTubeSize: 7.5, oralCuffed: true }, insertedAt: "2026-11-02T09:00:00.000Z", status: "in_use" }
const devices = [{ code: "ORAL_ETT", label: "Oral ETT" }, { code: "LMA", label: "LMA" }]
const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]!

describe("the airway picker on the phone (10.2.0)", () => {
  it("a reintubation keeps both tubes, the first failed", () => {
    const onSave = vi.fn()
    const tree = render(<AirwayExchangeSheet entries={[tube]} devices={devices} reason="reintubation" at={at} onSave={onSave} onClose={vi.fn()} />)
    act(() => { byId(tree, "airway-field-oralTubeSize").props.onChangeText("8") })
    act(() => { byId(tree, "airway-exchange-save").props.onPress() })
    const [next] = onSave.mock.calls[0] as [AirwayDeviceEntry[]]
    expect(next.map(entry => [entry.status, entry.details])).toEqual([["failed", { oralTubeSize: 7.5, oralCuffed: true }], ["in_use", { oralTubeSize: 8, oralCuffed: true }]])
  })

  it("Airway exchange asks why first; planned marks the old device replaced", () => {
    const onSave = vi.fn()
    const tree = render(<AirwayExchangeSheet entries={[tube]} devices={devices} reason={null} at={at} onSave={onSave} onClose={vi.fn()} />)
    act(() => { byId(tree, "airway-exchange-save").props.onPress() })
    expect(onSave).not.toHaveBeenCalled()
    act(() => { byId(tree, "airway-reason-planned").props.onPress() })
    act(() => { byId(tree, "airway-device-LMA").props.onPress() })
    act(() => { byId(tree, "airway-exchange-save").props.onPress() })
    expect((onSave.mock.calls[0][0] as AirwayDeviceEntry[]).map(entry => entry.status)).toEqual(["replaced", "in_use"])
  })

  it("opens for Reintubation charted here, keeps the old fields filled from the list", () => {
    const persist = vi.fn()
    let api: ReturnType<typeof usePhoneAirwayExchange> | null = null
    function Probe({ log }: { log: LogEvent[] }) {
      api = usePhoneAirwayExchange({ log, active: true, legacy: () => ({ airwayDevices: ["ORAL_ETT"], oralTubeSize: "7.5", oralCuffed: true }), persist })
      return null
    }
    const tree = render(<Probe log={[]} />)
    const event = { id: "r", ts: new Date().toISOString(), type: "clinical_event", label: "Reintubation", recordedAt: new Date().toISOString() } as LogEvent
    act(() => { tree.update(<Probe log={[event]} />) })
    expect(api!.dialog).toMatchObject({ reason: "reintubation" })
    expect(api!.entries()).toHaveLength(1)
    act(() => { api!.save([tube, { ...tube, id: "b" }]) })
    expect(persist.mock.calls[0]?.[0]).toEqual(expect.any(Array))
    expect(persist.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ airwayDevices: ["ORAL_ETT"], oralTubeSize: 7.5 }))
    expect(persist.mock.calls[0]?.[2]).toMatchObject({ id: "r", label: "Reintubation", ts: event.ts })
  })
})
