// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { describe, expect, it } from "vitest"
import enMessages from "../../../messages/en.json"
import type { PreopData } from "./preopSchema"
import { PediatricFastingFields } from "./PediatricPreopSections"

let latest: PreopData["pediatricFasting"] = []
const report = (rows: PreopData["pediatricFasting"]) => { latest = rows }

function Harness({ onRows }: { onRows: (rows: PreopData["pediatricFasting"]) => void }) {
  const { control, setValue } = useForm<PreopData>({ defaultValues: { clinicalMode: "PEDIATRIC", ageValue: 4, ageUnit: "YEARS", pediatricFasting: [] } as never })
  const rows = useWatch({ control, name: "pediatricFasting" })
  useEffect(() => { onRows(rows) }, [onRows, rows])
  // Its own card since 10.0.0, no longer inside the risk scores.
  return <PediatricFastingFields control={control} setValue={setValue} />
}

const input = (category: string) => screen.getByTestId(`npo-${category}`).querySelector("input") as HTMLInputElement

describe("the nil-by-mouth assignment", () => {
  it("assigns hours before surgery, starting from APAGBI 2023, and warns below the minimum", () => {
    render(<NextIntlClientProvider locale="en" messages={enMessages}><Harness onRows={report} /></NextIntlClientProvider>)
    expect(screen.queryByText(/last intake/i)).toBeNull()
    fireEvent.click(screen.getByText("Assign APAGBI 2023 hours"))
    expect(["CLEAR_FLUIDS", "BREAST_MILK", "INFANT_FORMULA_UNDER_1_YEAR", "SOLID_FOOD_OR_COW_MILK"].map(c => input(c).value)).toEqual(["1", "3", "4", "6"])
    fireEvent.change(input("SOLID_FOOD_OR_COW_MILK"), { target: { value: "4" } })
    expect(screen.getByText("Shorter than the APAGBI minimum of 6 h")).toBeTruthy()
    expect(latest?.find(row => row.category === "SOLID_FOOD_OR_COW_MILK")?.hoursBefore).toBe(4)
    fireEvent.change(input("BREAST_MILK"), { target: { value: "" } })
    expect(latest?.some(row => row.category === "BREAST_MILK")).toBe(false)
  })
})
