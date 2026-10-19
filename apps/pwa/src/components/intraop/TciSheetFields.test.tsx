import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))
vi.mock("@/components/VitalStepper", () => ({ VitalStepper: () => null }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ shade: (hex: string) => hex, language: "en", t: (key: string) => key, tc: (key: string) => key }),
}))

import { Text } from "react-native"
import { render } from "@/test/render"
import { DoseSelector } from "./DoseSelector"
import { PumpTotalField, TciOrRate, tciTargetSurface, tciTotalNote } from "./TciSheetFields"
import { VitalStepper } from "@/components/VitalStepper"
import type { InfusionRecord } from "@lospor/core/infusion-entry"

const man40 = { ageYears: 40, weightKg: 70, heightCm: 175, sex: "MALE" as const }
const press = (tree: ReturnType<typeof render>, testID: string) =>
  act(() => { tree.root.findByProps({ testID }).props.onPress() })

describe("TciOrRate (2026-10-18)", () => {
  it("leaves a drug without a TCI model to its rate fields", () => {
    const tree = render(<TciOrRate name="Noradrenaline" pediatric={false} patient={man40} color="#3b82f6" onConfirm={() => {}}><Text>rate fields</Text></TciOrRate>)
    expect(tree.root.findAllByProps({ testID: "tci-or-rate" })).toHaveLength(0)
  })

  it("starts a propofol TCI with the chosen model, Cp, and the target", () => {
    const onConfirm = vi.fn<(record: InfusionRecord) => void>()
    const tree = render(<TciOrRate name="Propofol" pediatric={false} patient={man40} color="#3b82f6" onConfirm={onConfirm}><Text>rate fields</Text></TciOrRate>)
    press(tree, "tci-mode-tci")
    press(tree, "tci-model-SCHNIDER")
    press(tree, "tci-site-PLASMA")
    const selector = tree.root.findByType(DoseSelector)
    expect(selector.props.unitSuffix).toBe("Cp mcg/mL")
    act(() => { selector.props.onValueChange("3.5") })
    act(() => { tree.root.findByType(DoseSelector).props.onConfirm() })
    expect(onConfirm).toHaveBeenCalledWith({ rate: 3.5, unit: "mcg/mL", tci: { model: "SCHNIDER", site: "PLASMA", opioids: true } })
  })

  it("blocks the start without a target, and warns when the preop lacks the patient", () => {
    const tree = render(<TciOrRate name="Remifentanil" pediatric={false} patient={null} color="#3b82f6" onConfirm={() => {}}><Text>rate fields</Text></TciOrRate>)
    press(tree, "tci-mode-tci")
    act(() => { tree.root.findByType(DoseSelector).props.onValueChange("") })
    expect(tree.root.findByType(DoseSelector).props.confirmBlockedReason).toBe("tciNeedsTarget")
    expect(tree.root.findAll(node => node.props.accessibilityRole === "alert" && node.props.children === "tciNeedsPatient").length).toBeGreaterThan(0)
  })
})

describe("the TCI change and stop", () => {
  it("changes the target within the model's range", () => {
    expect(tciTargetSurface("MINTO")).toMatchObject({ unit: "ng/mL", amountUnit: "mcg" })
    expect(tciTargetSurface(undefined)).toBeNull()
  })

  it("reports the pump total in the chosen unit", () => {
    const onChange = vi.fn()
    const tree = render(<PumpTotalField amountUnit="mg" color="#ef4444" onChange={onChange} />)
    act(() => { tree.root.findByType(VitalStepper).props.onChange(42.5) })
    expect(onChange).toHaveBeenLastCalledWith({ value: 42.5, unit: "mL" })
    act(() => { tree.root.findByProps({ label: "mg" }).props.onPress() })
    expect(onChange).toHaveBeenLastCalledWith({ value: 42.5, unit: "mg" })
  })

  it("says what a total rests on", () => {
    const tc = (key: string) => ({ tciTotalPump: "(pump; model {calculated} {unit})" } as Record<string, string>)[key] ?? key
    expect(tciTotalNote({ calculated: 610, pump: 615 }, "mg", tc)).toBe("(pump; model 610 mg)")
    expect(tciTotalNote({ calculated: 610, pump: null }, "mg", tc)).toBe("tciTotalCalculated")
    expect(tciTotalNote({ calculated: null, pump: null, unavailable: "patient" }, "mg", tc)).toBe("tciTotalNeedsPatient")
  })
})
