import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import type { MonitoringSuggestion } from "@lospor/core/monitoring-smart"

const setMonitoringScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, language: "en", monitoringScreen: "smart", setMonitoringScreen }),
}))

import { render } from "@/test/render"
import { MonitoringScreenCard } from "@/components/settings/MonitoringScreenCard"
import { MonitoringSmart } from "./MonitoringSmart"
import { MonitoringTab } from "./tabs/MonitoringTab"

const OPTS = [
  { field: "ecg", label: "ECG", section: "standard" }, { field: "bis", label: "Bispectral index (BIS)", section: "depth" },
  { field: "tofMonitor", label: "Neuromuscular monitoring (TOF / NMT)", section: "depth" }, { field: "etco2Monitor", label: "Capnography (EtCO₂)", section: "respiratory" },
]
const STANDARD = ["ecg", "spO2Monitor", "nbpMonitor"]
const NOW = "2026-11-02T10:00:00.000Z"
const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
const present = (tree: ReturnType<typeof render>, id: string) => byId(tree, id) !== undefined
const press = (tree: ReturnType<typeof render>, id: string) => act(() => { byId(tree, id)!.props.onPress() })

function setup(over: Partial<Parameters<typeof MonitoringSmart>[0]> = {}) {
  const onChange = vi.fn()
  const onHide = vi.fn()
  const onReading = vi.fn()
  const suggestions: MonitoringSuggestion[] = [{ field: "tofMonitor", reason: "relaxant" }, { field: "bis", reason: "tiva" }]
  const tree = render(
    <MonitoringSmart monitoring={STANDARD} onChange={onChange} monitoringOpts={OPTS} suggestions={suggestions} onHide={onHide}
      lastReading={() => null} onReading={onReading} now={() => NOW} {...over} />,
  )
  return { tree, onChange, onHide, onReading }
}

describe("Smart selection, the Monitoring tab on the phone (10.2.0)", () => {
  it("moves an added suggestion into On now in the controlled parent flow", () => {
    function Controlled() {
      const [active, setActive] = React.useState<string[]>(STANDARD)
      return <MonitoringSmart monitoring={active} onChange={setActive} monitoringOpts={OPTS} suggestions={[{ field: "tofMonitor", reason: "relaxant" }, { field: "bis", reason: "tiva" }]} onHide={vi.fn()}
        lastReading={() => null} onReading={vi.fn()} now={() => NOW} />
    }
    const tree = render(<Controlled />)
    press(tree, "monitoring-add-tofMonitor")
    expect(present(tree, "monitoring-on-tofMonitor")).toBe(true)
    expect(present(tree, "monitoring-suggestion-tofMonitor")).toBe(false)
  })

  it("shows standard on and one switch that turns the three off and keeps the others", () => {
    const { tree, onChange } = setup({ monitoring: [...STANDARD, "bis"] })
    expect(byId(tree, "monitoring-standard")!.props.accessibilityState.selected).toBe(true)
    press(tree, "monitoring-standard")
    expect(onChange).toHaveBeenCalledWith(["bis"])
  })

  it("lists the suggestions with a reason and adds one in a tap", () => {
    const { tree, onChange } = setup()
    expect(present(tree, "monitoring-suggestion-tofMonitor")).toBe(true)
    expect(present(tree, "monitoring-smart-empty")).toBe(true)
    press(tree, "monitoring-add-tofMonitor")
    expect(onChange).toHaveBeenCalledWith([...STANDARD, "tofMonitor"])
  })

  it("hides a suggestion for the case", () => {
    const { tree, onHide } = setup()
    press(tree, "monitoring-hide-bis")
    expect(onHide).toHaveBeenCalledWith({ field: "bis", reason: "tiva" })
  })

  it("shows what is on with a reading shortcut, amber when due, and turns it off", () => {
    const { tree, onChange, onReading } = setup({ monitoring: [...STANDARD, "bis"], suggestions: [] })
    expect(present(tree, "monitoring-no-suggestions")).toBe(true)
    expect(present(tree, "monitoring-reading-bis")).toBe(true)
    press(tree, "monitoring-reading-bis")
    expect(onReading).toHaveBeenCalledWith("bis")
    press(tree, "monitoring-off-bis")
    expect(onChange).toHaveBeenCalledWith(STANDARD)
  })

  it("has no reading shortcut for a monitor that carries no number", () => {
    const { tree } = setup({ monitoring: [...STANDARD, "ecg", "etco2Monitor"], suggestions: [] })
    expect(present(tree, "monitoring-reading-etco2Monitor")).toBe(true)
    expect(present(tree, "monitoring-reading-ecg")).toBe(false)
  })

  it("opens the full grouped list in place under More monitors", () => {
    const { tree, onChange } = setup()
    expect(present(tree, "monitoring-groups")).toBe(false)
    press(tree, "monitoring-more")
    expect(present(tree, "monitoring-groups")).toBe(true)
    press(tree, "monitoring-tile-entropyMonitor")
    expect(onChange).toHaveBeenCalledWith([...STANDARD, "entropyMonitor"])
  })
})

describe("the Legacy Monitoring tab is the full list by purpose", () => {
  it("toggles a monitor and saves the list", () => {
    const setMonitoring = vi.fn()
    const saveMonitoring = vi.fn()
    const tree = render(<MonitoringTab monitoring={["ecg"]} setMonitoring={setMonitoring} saveMonitoring={saveMonitoring} fieldSaving={null} monitoringOpts={OPTS} />)
    expect(present(tree, "monitoring-groups")).toBe(true)
    press(tree, "monitoring-tile-bis")
    expect(setMonitoring).toHaveBeenCalledWith(["ecg", "bis"])
    expect(saveMonitoring).toHaveBeenCalledWith(["ecg", "bis"])
  })
})

describe("the Monitoring tab setting on the phone", () => {
  it("offers Smart selection and Legacy and saves the one picked", () => {
    const tree = render(<MonitoringScreenCard />)
    expect(present(tree, "monitoring-screen-smart")).toBe(true)
    act(() => { byId(tree, "monitoring-screen-legacy")!.props.onPress() })
    expect(setMonitoringScreen).toHaveBeenCalledWith("legacy")
  })
})
