import React from "react"
import { describe, expect, it } from "vitest"
import { render } from "@/test/render"
import { PediatricIntraopReference } from "./PediatricIntraopReference"

const text = (tree: ReturnType<typeof render>) => JSON.stringify(tree.toJSON())

describe("the paediatric reference on the PWA intraop screen", () => {
  it("shows BSA, maintenance fluid and resuscitation without anything to accept", () => {
    const shown = text(render(<PediatricIntraopReference language="en" preop={{ clinicalMode: "PEDIATRIC", weight: 24, height: 122, ageValue: 7, ageUnit: "YEARS" } as never} />))
    expect(shown).toContain("0.9018 m²")
    expect(shown).toContain("1580 ml/day · 65.8 ml/h")
    expect(shown).toContain("Shock 96 J (4 J/kg); from the 5th shock up to 192 J (8 J/kg, max 360 J)")
    expect(shown).toContain("Adrenaline 240 mcg")
  })

  it("speaks Bulgarian", () => {
    const shown = text(render(<PediatricIntraopReference language="bg" preop={{ clinicalMode: "PEDIATRIC", weight: 24, height: 122, ageValue: 7, ageUnit: "YEARS" } as never} />))
    expect(shown).toContain("Педиатрична справка")
    expect(shown).toContain("Амиодарон 120 mg след 3-ия шок")
  })

  it("shows nothing until there is a weight", () => {
    expect(render(<PediatricIntraopReference language="en" preop={{ clinicalMode: "PEDIATRIC", height: 122 } as never} />).toJSON()).toBeNull()
  })

  it("reads the nil-by-mouth assignment as clock times once surgery has started", () => {
    const preop = { clinicalMode: "PEDIATRIC", weight: 12, pediatricFasting: [{ category: "CLEAR_FLUIDS", hoursBefore: 1 }, { category: "BREAST_MILK", hoursBefore: 10 }] } as never
    const shown = text(render(<PediatricIntraopReference language="bg" preop={preop} surgeryStart={new Date("2026-10-16T05:30:00Z")} timezone="Europe/Sofia" />))
    expect(shown).toContain(": до 07:30 (1 h преди)")
    expect(shown).toContain(": до 22:30 (10 h преди) · предния ден")
    expect(text(render(<PediatricIntraopReference language="en" preop={preop} />))).not.toContain("by 07:30")
  })
})
