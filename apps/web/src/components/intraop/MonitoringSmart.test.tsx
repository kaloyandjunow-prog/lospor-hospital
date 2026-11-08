// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import type { MonitoringSuggestion } from "@lospor/core/monitoring-smart"
import type { LibraryOption } from "@/hooks/useOptionLibrary"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { MonitoringSmart } from "./MonitoringSmart"
import { MonitoringGroups } from "./MonitoringGroups"

const OPTIONS = [
  { value: "ecg", label: "ECG", group: "standard" }, { value: "bis", label: "Bispectral index (BIS)", group: "depth" },
  { value: "tofMonitor", label: "Neuromuscular monitoring (TOF / NMT)", group: "depth" }, { value: "etco2Monitor", label: "Capnography (EtCO₂)", group: "respiratory" },
] as unknown as LibraryOption[]
const STANDARD = ["ecg", "spO2Monitor", "nbpMonitor"]
const NOW = "2026-11-02T10:00:00.000Z"
const SUGGESTIONS: MonitoringSuggestion[] = [{ field: "tofMonitor", reason: "relaxant" }, { field: "bis", reason: "tiva" }]

function setup(overrides: Partial<Parameters<typeof MonitoringSmart>[0]> = {}) {
  const onChange = vi.fn()
  const onHide = vi.fn()
  render(<MonitoringSmart monitoring={STANDARD} onChange={onChange} monitoringOptions={OPTIONS} suggestions={SUGGESTIONS} onHide={onHide}
    lastReading={() => null} now={() => NOW} {...overrides} />)
  return { onChange, onHide }
}

describe("Smart selection, the Monitoring section (10.2.0)", () => {
  it("opens the reading entry from the chip, as the phone does", () => {
    const onReading = vi.fn()
    setup({ monitoring: [...STANDARD, "bis"], onReading })
    fireEvent.click(screen.getByTestId("monitoring-reading-bis"))
    expect(onReading).toHaveBeenCalledWith("bis")
  })

  it("moves an added suggestion into On now in the controlled parent flow", () => {
    function Controlled() {
      const [active, setActive] = React.useState<string[]>(STANDARD)
      return <MonitoringSmart monitoring={active} onChange={setActive} monitoringOptions={OPTIONS} suggestions={SUGGESTIONS} onHide={vi.fn()}
        lastReading={() => null} now={() => NOW} />
    }
    render(<Controlled />)
    fireEvent.click(screen.getByTestId("monitoring-add-tofMonitor"))
    expect(screen.getByTestId("monitoring-on-tofMonitor")).toBeTruthy()
    expect(screen.queryByTestId("monitoring-suggestion-tofMonitor")).toBeNull()
  })

  it("turns the three standard monitors off with one switch and keeps the others", () => {
    const { onChange } = setup({ monitoring: [...STANDARD, "bis"] })
    expect(screen.getByTestId("monitoring-standard").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByTestId("monitoring-standard"))
    expect(onChange).toHaveBeenCalledWith(["bis"])
  })

  it("lists suggestions with a reason, adds one and hides one", () => {
    const { onChange, onHide } = setup()
    expect(screen.getByTestId("monitoring-suggestion-tofMonitor")).toBeTruthy()
    fireEvent.click(screen.getByTestId("monitoring-add-tofMonitor"))
    expect(onChange).toHaveBeenCalledWith([...STANDARD, "tofMonitor"])
    fireEvent.click(screen.getByTestId("monitoring-hide-bis"))
    expect(onHide).toHaveBeenCalledWith({ field: "bis", reason: "tiva" })
  })

  it("shows what is on with its last reading and turns it off", () => {
    const { onChange } = setup({ monitoring: [...STANDARD, "bis"], suggestions: [], lastReading: () => ({ text: "46", at: "2026-11-02T09:55:00.000Z" }) })
    expect(screen.getByTestId("monitoring-no-suggestions")).toBeTruthy()
    expect(screen.getByTestId("monitoring-reading-bis").textContent).toBe("46")
    fireEvent.click(screen.getByTestId("monitoring-off-bis"))
    expect(onChange).toHaveBeenCalledWith(STANDARD)
  })

  it("shows no reading for a monitor that carries no number", () => {
    setup({ monitoring: [...STANDARD, "ecg"], suggestions: [] })
    expect(screen.queryByTestId("monitoring-reading-ecg")).toBeNull()
  })

  it("opens the full grouped list in place under More monitors", () => {
    const { onChange } = setup()
    expect(screen.queryByTestId("monitoring-groups")).toBeNull()
    fireEvent.click(screen.getByTestId("monitoring-more"))
    expect(screen.getByTestId("monitoring-groups")).toBeTruthy()
    fireEvent.click(screen.getByTestId("monitoring-tile-entropyMonitor"))
    expect(onChange).toHaveBeenCalledWith([...STANDARD, "entropyMonitor"])
  })
})

describe("the Legacy Monitoring section is the full list by purpose", () => {
  it("toggles a monitor", () => {
    const onToggle = vi.fn()
    render(<MonitoringGroups monitoring={["ecg"]} onToggle={onToggle} monitoringOptions={OPTIONS} />)
    expect(screen.getByTestId("monitoring-tile-ecg").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByTestId("monitoring-tile-bis"))
    expect(onToggle).toHaveBeenCalledWith("bis")
  })
})
