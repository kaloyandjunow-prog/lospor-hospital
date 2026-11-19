// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }))

import { GasSettingsPopover } from "./GasSettingsPopover"

function open(fgf: number | null) {
  const onFgfChange = vi.fn()
  render(<GasSettingsPopover anchor={{ top: 0, bottom: 10, left: 0, right: 10, width: 10 }} isEditing={false} fgf={fgf} carrierGas="air" fio2={50}
    carrierGasLabel={(_value, fallback) => fallback} onFgfChange={onFgfChange} onCarrierGasChange={vi.fn()} onFio2Change={vi.fn()} onDismiss={vi.fn()} onApply={vi.fn()} />)
  return onFgfChange
}

describe("gas quick values (the same set as the phone, from core)", () => {
  function render2(extra: Partial<Parameters<typeof GasSettingsPopover>[0]> = {}, carrierGas: string | null = "air") {
    const onFgfChange = vi.fn()
    const onFio2Change = vi.fn()
    render(<GasSettingsPopover anchor={{ top: 0, bottom: 10, left: 0, right: 10, width: 10 }} isEditing={false} fgf={1} carrierGas={carrierGas} fio2={40}
      carrierGasLabel={(_value, fallback) => fallback} onFgfChange={onFgfChange} onCarrierGasChange={vi.fn()} onFio2Change={onFio2Change}
      onDismiss={vi.fn()} onApply={vi.fn()} {...extra} />)
    return { onFgfChange, onFio2Change }
  }

  it("offers 0.5, 1, 2, 4, 6 L/min and 30, 40, 50, 80, 100 % to an adult with guidance on, and sets them", () => {
    const { onFgfChange, onFio2Change } = render2()
    for (const value of [0.5, 1, 2, 4, 6]) expect(screen.getByTestId(`fgf-quick-${value}`)).toBeTruthy()
    for (const value of [30, 40, 50, 80, 100]) expect(screen.getByTestId(`fio2-quick-${value}`)).toBeTruthy()
    fireEvent.click(screen.getByTestId("fgf-quick-4"))
    expect(onFgfChange).toHaveBeenLastCalledWith(4)
    fireEvent.click(screen.getByTestId("fio2-quick-50"))
    expect(onFio2Change).toHaveBeenLastCalledWith(50)
  })

  it("offers none for a child or with guidance off, and the sliders stay", () => {
    for (const extra of [{ paediatric: true }, { prospectiveGuidanceEnabled: false }]) {
      const { unmount } = render(<GasSettingsPopover anchor={{ top: 0, bottom: 10, left: 0, right: 10, width: 10 }} isEditing={false} fgf={1} carrierGas="air" fio2={40}
        carrierGasLabel={(_value, fallback) => fallback} onFgfChange={vi.fn()} onCarrierGasChange={vi.fn()} onFio2Change={vi.fn()} onDismiss={vi.fn()} onApply={vi.fn()} {...extra} />)
      expect(screen.queryByTestId("fgf-quick")).toBeNull()
      expect(screen.queryByTestId("fio2-quick")).toBeNull()
      expect(screen.getByTestId("fgf-slider")).toBeTruthy()
      unmount()
    }
  })

  it("leaves the oxygen buttons off while oxygen is alone, as the slider is", () => {
    render2({}, null)
    expect((screen.getByTestId("fio2-quick-50") as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("the fresh gas flow control (10.2.0)", () => {
  it("steps by 0.1 L/min up to 5 and by 0.5 above", () => {
    const change = open(4.9)
    fireEvent.click(screen.getByTestId("fgf-plus"))
    expect(change).toHaveBeenLastCalledWith(5)
    fireEvent.click(screen.getByTestId("fgf-minus"))
    expect(change).toHaveBeenLastCalledWith(4.8)
  })

  it("spans 0-20 on the slider and snaps to its steps", () => {
    const change = open(6)
    const slider = screen.getByTestId("fgf-slider") as HTMLInputElement
    expect(slider.max).toBe("20")
    fireEvent.change(slider, { target: { value: "7.3" } })
    expect(change).toHaveBeenLastCalledWith(7.5)
  })

  it("takes a typed flow up to 100 L/min and ignores one above", () => {
    const change = open(2)
    const typed = screen.getByTestId("fgf-typed")
    fireEvent.change(typed, { target: { value: "60" } })
    fireEvent.blur(typed)
    expect(change).toHaveBeenLastCalledWith(60)
    change.mockClear()
    fireEvent.change(typed, { target: { value: "150" } })
    fireEvent.blur(typed)
    expect(change).not.toHaveBeenCalled()
  })
})
