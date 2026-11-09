import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import type { VascularLine } from "@lospor/core/vascular-access-lines"

const setVascularScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, language: "en", vascularScreen: "smart", setVascularScreen }),
}))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { usePhoneVascularEvents } from "@/lib/use-phone-vascular-smart"
import { VascularScreenCard } from "@/components/settings/VascularScreenCard"
import { VascularSmart } from "./VascularSmart"

const START = "2026-11-02T09:30:00.000Z"
const NOW = "2026-11-02T09:55:00.000Z"
const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
const present = (tree: ReturnType<typeof render>, id: string) => byId(tree, id) !== undefined
const press = (tree: ReturnType<typeof render>, id: string) => act(() => { byId(tree, id)!.props.onPress() })

function setup(overrides: Partial<Parameters<typeof VascularSmart>[0]> = {}) {
  const onChange = vi.fn()
  const tree = render(
    <VascularSmart lines={[]} onChange={onChange} patient={{ clinicalMode: "ADULT", ageYears: 45 }} techniques={["GENERAL_TIVA"]} startedAt={START}
      now={() => NOW} timeZone="UTC" siteLabel={code => code} timeOf={iso => iso.slice(11, 16)} {...overrides} />,
  )
  return { tree, onChange }
}
const saved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls[0]![0] as VascularLine[]

describe("Smart selection, the Vascular access tab on the phone (10.2.0)", () => {
  it("leads with all three kinds for general anaesthesia and keeps the others behind More types for a regional case", () => {
    const general = setup()
    for (const type of ["PERIPHERAL", "ARTERIAL", "CENTRAL"]) expect(present(general.tree, `vascular-smart-card-${type}`)).toBe(true)
    expect(present(general.tree, "vascular-smart-empty")).toBe(true)
    const regional = setup({ techniques: ["REGIONAL_SPINAL"] })
    expect(present(regional.tree, "vascular-smart-card-ARTERIAL")).toBe(false)
    press(regional.tree, "vascular-smart-more")
    expect(present(regional.tree, "vascular-smart-other-ARTERIAL")).toBe(true)
  })

  it("adds a peripheral line at the start of anaesthesia with the suggested size and no site", () => {
    const { tree, onChange } = setup()
    press(tree, "vascular-smart-card-PERIPHERAL")
    expect(present(tree, "vascular-smart-site-VEN_PERIPHERAL")).toBe(false)
    press(tree, "vascular-smart-add")
    expect(saved(onChange)[0]).toMatchObject({ site: "VEN_PERIPHERAL", size: "18", sizeUnit: "G", insertedAt: START })
  })

  it("opens the complete legacy site catalogue and carries a selected site into the panel", () => {
    const { tree } = setup({ techniques: ["REGIONAL_SPINAL"] })
    press(tree, "vascular-smart-catalog")
    expect(present(tree, "vascular-smart-catalog-ART_ULNAR")).toBe(true)
    expect(present(tree, "vascular-smart-catalog-CVK_EJV")).toBe(true)
    press(tree, "vascular-smart-catalog-CVK_EJV")
    expect(present(tree, "vascular-smart-site-CVK_EJV")).toBe(true)
  })

  it("offers 24G and 26G and takes the size picked and the time now", () => {
    const { tree, onChange } = setup()
    press(tree, "vascular-smart-card-PERIPHERAL")
    expect(present(tree, "vascular-smart-size-26")).toBe(true)
    press(tree, "vascular-smart-size-24")
    press(tree, "vascular-smart-time-now")
    press(tree, "vascular-smart-add")
    expect(saved(onChange)[0]).toMatchObject({ size: "24", insertedAt: NOW })
  })

  it("marks a line that arrived with the patient, with no time of ours", () => {
    const { tree, onChange } = setup()
    press(tree, "vascular-smart-ward")
    press(tree, "vascular-smart-add")
    expect(saved(onChange)[0]).toMatchObject({ preexisting: true, insertedAt: null })
  })

  it("adds a central line with lumens, depth and size in Fr", () => {
    const { tree, onChange } = setup()
    press(tree, "vascular-smart-card-CENTRAL")
    press(tree, "vascular-smart-lumens-2")
    press(tree, "vascular-smart-depth-14")
    press(tree, "vascular-smart-size-8")
    press(tree, "vascular-smart-add")
    expect(saved(onChange)[0]).toMatchObject({ site: "CVK_IJV", sizeUnit: "Fr", size: "8", lumens: "2", depthCm: "14" })
  })

  it("collapses a selected kind when tapped again and charts CVC in on confirmation", () => {
    const onEvent = vi.fn()
    const { tree, onChange } = setup({ onEvent })
    press(tree, "vascular-smart-card-CENTRAL")
    expect(present(tree, "vascular-smart-panel")).toBe(true)
    press(tree, "vascular-smart-card-CENTRAL")
    expect(present(tree, "vascular-smart-panel")).toBe(false)
    press(tree, "vascular-smart-card-CENTRAL")
    press(tree, "vascular-smart-add")
    const event = onEvent.mock.calls[0]![0]
    expect(event).toMatchObject({ label: "CVC in", ts: START, intraopPatch: expect.objectContaining({ vascularAccesses: expect.any(Array) }) })
    expect((onChange.mock.calls[0]![0] as VascularLine[])[0]!.sourceEventId).toBe(event.id)
    expect(event.id).toEqual(expect.any(String))
  })

  it("adds a second line and keeps both when one fails: the first struck through, the second in place", () => {
    const first: VascularLine = { id: "v1", site: "VEN_PERIPHERAL", siteLabel: "Venous › Peripheral IV", size: "18", sizeUnit: "G", insertedAt: START }
    const { tree, onChange } = setup({ lines: [first] })
    press(tree, "vascular-smart-card-PERIPHERAL")
    press(tree, "vascular-smart-add")
    expect(saved(onChange)).toHaveLength(2)
    onChange.mockClear()
    press(tree, "vascular-smart-fail-0")
    press(tree, "vascular-smart-add")
    const next = saved(onChange)
    expect(next.map(line => [line.id, line.failed ?? false])).toEqual([["v1", true], [expect.stringMatching(/^vascular-/), false]])
  })

  it("shows what is in place first, told apart, and no Failed button on a failed line", () => {
    const lines: VascularLine[] = [
      { id: "a", site: "VEN_PERIPHERAL", siteLabel: "x", size: "20", sizeUnit: "G", preexisting: true, insertedAt: null },
      { id: "b", site: "VEN_PERIPHERAL", siteLabel: "x", size: "18", sizeUnit: "G", insertedAt: START, failed: true, failedAt: NOW },
    ]
    const { tree } = setup({ lines })
    expect(present(tree, "vascular-smart-empty")).toBe(false)
    expect(present(tree, "vascular-smart-fail-0")).toBe(true)
    expect(present(tree, "vascular-smart-fail-1")).toBe(false)
  })
})

describe("Smart selection for vascular access opens from the timeline on the phone", () => {
  it("opens the panel for IV line in, once, with that time, and not for the legacy tab", () => {
    let api: ReturnType<typeof usePhoneVascularEvents> | null = null
    function Probe({ log, active, smart }: { log: LogEvent[]; active: boolean; smart: boolean }) {
      api = usePhoneVascularEvents({ log, active, smart, lines: () => [] })
      return null
    }
    const tree = render(<Probe log={[]} active smart />)
    const at = new Date().toISOString()
    const event = { id: "e1", ts: at, type: "clinical_event", label: "CVC in", recordedAt: at } as LogEvent
    act(() => { tree.update(<Probe log={[event]} active smart />) })
    expect(api!.request).toMatchObject({ type: "CENTRAL", centralType: "CVK", at, source: "timeline" })
    act(() => { api!.setRequest(null) })
    act(() => { tree.update(<Probe log={[event]} active smart />) })
    expect(api!.request).toBeNull()

    const legacy = render(<Probe log={[]} active={false} smart={false} />)
    act(() => { legacy.update(<Probe log={[{ ...event, id: "e2" }]} active={false} smart={false} />) })
    expect(api!.request).toBeNull()
  })
})

describe("the Vascular access tab setting on the phone", () => {
  it("offers Smart selection and Legacy and saves the one picked", () => {
    const tree = render(<VascularScreenCard />)
    expect(present(tree, "vascular-screen-smart")).toBe(true)
    act(() => { byId(tree, "vascular-screen-legacy")!.props.onPress() })
    expect(setVascularScreen).toHaveBeenCalledWith("legacy")
  })
})
