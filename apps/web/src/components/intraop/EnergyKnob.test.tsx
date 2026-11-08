// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
const patch = vi.fn(async () => ({}))
vi.mock("@/lib/clinical-preferences-web", () => ({
  readWebClinicalPreferences: () => ({ energyKnobSkin: "B" }),
  syncWebClinicalPreferences: async () => ({ energyKnobSkin: "B" }),
  patchWebClinicalPreferences: (...args: unknown[]) => patch(...(args as [])),
}))

import { EnergyKnob, energyAtKnobAngle, energyKnobAngle } from "./EnergyKnob"
import { EnergyKnobSkinSetting } from "@/components/settings/EnergyKnobSkinSetting"
import { DefibrillationDialog } from "./DefibrillationDialog"

describe("the energy knob skins (10.2.0)", () => {
  it("A and B turn to any energy; C snaps a drag to its stops", () => {
    expect(energyAtKnobAngle("A", 0)).toBe(energyAtKnobAngle("B", 0))
    expect(energyAtKnobAngle("C", energyKnobAngle("C", 150) + 3)).toBe(150)
    expect(energyAtKnobAngle("C", 0)).toBeGreaterThan(0)
    expect([2, 5, 10, 15, 20, 30, 50, 70, 100, 120, 150, 170, 200, 300, 360]).toContain(energyAtKnobAngle("C", 37))
  })

  it("every skin takes the arrow keys and Page Up / Down", () => {
    for (const skin of ["A", "B", "C"] as const) {
      const onChange = vi.fn()
      render(<EnergyKnob skin={skin} energy={150} onChange={onChange} label="Energy" valueText="150 J" testId={`knob-${skin}`} />)
      const knob = screen.getByTestId(`knob-${skin}`)
      fireEvent.keyDown(knob, { key: "ArrowUp" })
      expect(onChange).toHaveBeenLastCalledWith(151)
      fireEvent.keyDown(knob, { key: "PageDown" })
      expect(onChange).toHaveBeenLastCalledWith(140)
    }
  })

  it("the shock dialog shows the clinician's skin", async () => {
    await act(async () => {
      render(<DefibrillationDialog timeLabel="10:00" shockNumber={1} prefillJoules={null} onCancel={vi.fn()} onSave={vi.fn()} />)
    })
    expect(screen.getByTestId("defib-dial").getAttribute("data-skin")).toBe("B")
  })

  it("Settings shows three previews that turn, and saves the one picked", async () => {
    await act(async () => { render(<EnergyKnobSkinSetting />) })
    fireEvent.keyDown(screen.getByTestId("energy-knob-preview-C"), { key: "PageUp" })
    expect(screen.getByTestId("energy-knob-setting").textContent).toContain("160 J")
    fireEvent.click(screen.getByTestId("energy-knob-pick-C"))
    expect(patch).toHaveBeenCalledWith({ energyKnobSkin: "C" })
  })
})
