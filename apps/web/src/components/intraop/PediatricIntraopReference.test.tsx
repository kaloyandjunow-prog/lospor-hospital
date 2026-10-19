// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import enMessages from "../../../messages/en.json"
import { PediatricIntraopReference } from "./PediatricIntraopReference"

const show = (preop: Record<string, unknown>) => render(
  <NextIntlClientProvider locale="en" messages={enMessages}>
    <PediatricIntraopReference preop={preop as never} />
  </NextIntlClientProvider>,
)

describe("the paediatric reference in intraop", () => {
  it("shows BSA, maintenance fluid and resuscitation without anything to accept", () => {
    show({ clinicalMode: "PEDIATRIC", weightKg: 24, heightCm: 122, ageValue: 7, ageUnit: "YEARS" })
    const text = screen.getByTestId("pediatric-intraop-reference").textContent ?? ""
    expect(text).toContain("0.9018 m²")
    expect(text).toContain("1580 ml/day · 65.8 ml/h")
    expect(text).toContain("Shock 96 J (4 J/kg); from the 5th shock up to 192 J (8 J/kg, max 360 J)")
    expect(text).toContain("Adrenaline 240 mcg")
    expect(text).toContain("Amiodarone 120 mg after the 3rd shock, 120 mg after the 5th")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shows nothing until there is a weight", () => {
    show({ clinicalMode: "PEDIATRIC", heightCm: 122 })
    expect(screen.queryByTestId("pediatric-intraop-reference")).toBeNull()
  })

  it("reads the nil-by-mouth assignment as clock times once surgery has started", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PediatricIntraopReference preop={{ clinicalMode: "PEDIATRIC", weightKg: 12, pediatricFasting: [{ category: "CLEAR_FLUIDS", hoursBefore: 1 }, { category: "BREAST_MILK", hoursBefore: 10 }] } as never}
          surgeryStart="2026-10-16T05:30:00Z" timezone="Europe/Sofia" />
      </NextIntlClientProvider>,
    )
    const text = screen.getByTestId("pediatric-npo-clock").textContent ?? ""
    expect(text).toContain("Clear fluids: by 07:30 (1 h before)")
    expect(text).toContain("Breast milk: by 22:30 (10 h before) · the day before")
  })

  it("shows no clock times before surgery starts", () => {
    show({ clinicalMode: "PEDIATRIC", weightKg: 12, pediatricFasting: [{ category: "CLEAR_FLUIDS", hoursBefore: 1 }, { category: "BREAST_MILK", hoursBefore: 10 }] })
    expect(screen.queryByTestId("pediatric-npo-clock")).toBeNull()
  })
})
