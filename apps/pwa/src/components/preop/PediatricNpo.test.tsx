import React from "react"
import { useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"
import { AuthProvider } from "@/lib/auth-context"
import { PreferencesProvider } from "@/lib/preferences-context"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import { pressByText, queryByText, render } from "@/test/render"
import { PediatricRiskAndCalculators } from "./PediatricPreopSections"

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }))
vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))

let latest: PreopFormInput["pediatricFasting"] = []

function Harness() {
  const { control, setValue, watch } = useForm<PreopFormInput>({ defaultValues: { clinicalMode: "PEDIATRIC", ageValue: 4, ageUnit: "YEARS", pediatricFasting: [] } as never })
  latest = watch("pediatricFasting")
  return <PediatricRiskAndCalculators control={control} setValue={setValue} tc={key => key} language="en" />
}

describe("the nil-by-mouth assignment on the PWA", () => {
  it("assigns hours before surgery from APAGBI 2023, with no last-intake question", () => {
    const tree = render(<AuthProvider><PreferencesProvider initialLanguage="en"><Harness /></PreferencesProvider></AuthProvider>)
    expect(queryByText(tree, "Hours since last intake")).toBeNull()
    pressByText(tree, "Assign APAGBI 2023 hours")
    expect(latest?.map(row => [row.category, row.hoursBefore])).toEqual([
      ["CLEAR_FLUIDS", 1], ["BREAST_MILK", 3], ["INFANT_FORMULA_UNDER_1_YEAR", 4], ["SOLID_FOOD_OR_COW_MILK", 6],
    ])
  })
})
