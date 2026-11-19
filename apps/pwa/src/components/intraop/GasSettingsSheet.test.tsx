import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn(), hapticKey: vi.fn() }))
vi.mock("expo-haptics", () => ({}))

import { GasSettingsSheet } from "./GasSettingsSheet"
import { renderWithPreferences } from "./fluid-sheet-test-fixtures"

function sheet(extra: Partial<Parameters<typeof GasSettingsSheet>[0]> = {}) {
  const onFgfChange = vi.fn()
  const onFio2Change = vi.fn()
  const tree = renderWithPreferences(
    <GasSettingsSheet
      visible isEditing={false} fgf={1} carrierGas="air" fio2={40} onClose={() => {}}
      onFgfChange={onFgfChange} onCarrierGasChange={() => {}} onFio2Change={onFio2Change} onConfirm={() => {}}
      {...extra}
    />,
  )
  const find = (testID: string) => tree.root.findAll(node => node.props?.testID === testID && typeof node.type !== "function")
  return { tree, find, onFgfChange, onFio2Change }
}

describe("gas quick values (the same set as web, from core)", () => {
  it("offers 0.5, 1, 2, 4, 6 L/min and 30, 40, 50, 80, 100 % to an adult with guidance on", () => {
    const { find } = sheet()
    for (const value of [0.5, 1, 2, 4, 6]) expect(find(`gas-fgf-quick-${value}`).length).toBeGreaterThan(0)
    for (const value of [30, 40, 50, 80, 100]) expect(find(`gas-fio2-quick-${value}`).length).toBeGreaterThan(0)
  })

  it("sets the flow or the oxygen from a quick value", () => {
    const { find, onFgfChange, onFio2Change } = sheet()
    act(() => find("gas-fgf-quick-4")[0]!.props.onPress())
    expect(onFgfChange).toHaveBeenCalledWith(4)
    act(() => find("gas-fio2-quick-50")[0]!.props.onPress())
    expect(onFio2Change).toHaveBeenCalledWith(50)
  })

  it("offers none for a child or with guidance off, but keeps the sliders", () => {
    for (const extra of [{ pediatricMode: true }, { prospectiveGuidanceEnabled: false }]) {
      const { find } = sheet(extra)
      expect(find("gas-fgf-quick").length).toBe(0)
      expect(find("gas-fio2-quick").length).toBe(0)
      expect(find("stepper-track").length).toBeGreaterThan(0)
    }
  })

  it("leaves the oxygen buttons off while oxygen is alone, as the slider is", () => {
    const { find } = sheet({ carrierGas: null })
    expect(find("gas-fio2-quick-50")[0]!.props.disabled).toBe(true)
  })
})
