// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

import type { DoseProfile } from "@lospor/core/catalog"
import { DoseProfileEditor } from "./DoseProfileEditor"

const paracetamol = {
  kind: "bolus", mode: "dose", rounding: "nearest_step", quickValues: [], routes: ["IV"], defaultRoute: "IV", weightBasis: "TBW",
  routeModes: { IV: { mode: "dose", min: 0, max: 1000, step: 10, quickValues: [500, 1000], unit: "mg", weightBasis: "TBW", doseCalc: { perKg: 15, basis: "TBW", flat: 1000, flatFromKg: 50, cap: 1000 } } },
} as unknown as DoseProfile

describe("the weight from which a fixed dose applies (10.2.0)", () => {
  it("shows the weight and the fixed dose on a per-kilogram route, and edits each", () => {
    const onChange = vi.fn()
    render(<DoseProfileEditor profile={paracetamol} onChange={onChange} />)
    const from = screen.getByLabelText("Fixed dose from (kg)") as HTMLInputElement
    expect(from.value).toBe("50")
    expect((screen.getByLabelText("Fixed dose from that weight") as HTMLInputElement).value).toBe("1000")
    fireEvent.change(from, { target: { value: "60" } })
    const next = onChange.mock.calls.at(-1)![0] as { routeModes: { IV: { doseCalc: Record<string, unknown> } } }
    expect(next.routeModes.IV.doseCalc).toMatchObject({ perKg: 15, flatFromKg: 60, flat: 1000 })
  })
})
