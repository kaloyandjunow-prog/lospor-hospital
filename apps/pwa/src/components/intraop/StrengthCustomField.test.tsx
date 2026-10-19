import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, t: (key: string) => key, language: "en", shade: (value: string) => value }),
}))

import { render } from "@/test/render"
import { VitalStepper } from "@/components/VitalStepper"
import { DoseSelector } from "./DoseSelector"
import { StrengthCustomField } from "./StrengthCustomField"

// A strength typed with Other (2026-10-18): sliders, pills and a prefill, and
// a number outside the drug's range is refused out loud.

describe("Other on a local anaesthetic", () => {
  it("opens prefilled, with the drug's strengths as pills, and reports the number", () => {
    const onChange = vi.fn()
    const tree = render(<StrengthCustomField name="Ropivacaine" unit="PERCENT" options={["0.2%", "0.5%", "0.75%"]} color="#0ea5e9" onChange={onChange} />)
    expect(tree.root.findByType(VitalStepper).props).toMatchObject({ value: 0.5, min: 0.05, max: 1, unit: "%" })
    expect(tree.root.findAllByProps({ testID: "strength-custom-pill-0.2" }).length).toBeGreaterThan(0)
    expect(onChange).toHaveBeenLastCalledWith("0.5")
    act(() => { tree.root.findByType(VitalStepper).props.onChange(0.15) })
    expect(onChange).toHaveBeenLastCalledWith("0.15")
  })

  it("says the range and passes nothing on for a number outside it", () => {
    const onChange = vi.fn()
    const tree = render(<StrengthCustomField name="Ropivacaine" unit="PERCENT" options={["0.2%"]} color="#0ea5e9" onChange={onChange} />)
    act(() => { tree.root.findByType(VitalStepper).props.onChange(2) })
    expect(tree.root.findByProps({ testID: "strength-custom-error" }).props.children).toBe("strengthOutOfRange")
    expect(onChange).toHaveBeenLastCalledWith("")
  })

  it("replaces the typed box in the dose selector", () => {
    const tree = render(
      <DoseSelector value="10" onValueChange={() => {}} min={0} max={20} unitSuffix="mL"
        concentrationOptions={["0.25%", "0.5%"]} concentrationUnit="PERCENT" concentrationName="Bupivacaine"
        customConcentration="" onCustomConcentrationChange={() => {}} />,
    )
    expect(tree.root.findAllByProps({ testID: "strength-custom-field" }).length).toBeGreaterThan(0)
    expect(tree.root.findAllByProps({ testID: "concentration-custom-input" })).toHaveLength(0)
  })
})
