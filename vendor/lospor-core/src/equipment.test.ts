import { describe, expect, it } from "vitest"
import {
  EQUIPMENT_GUIDANCE_SOURCE_REFS,
  EQUIPMENT_GUIDANCE_VERSION,
  calcEquipment,
} from "./equipment"

const adultRows = [
  ["ETT size", "ETT depth (lip)", "LMA size", "Laryngoscope", "Guedel OPA", "Suction catheter"],
  ["Tidal volume", "Rate", "PEEP", "I:E ratio"],
  ["Maintenance"],
  ["Urinary catheter", "NGT"],
  ["BP cuff", "Defibrillator"],
]

describe("fixed equipment guidance", () => {
  it("keeps the established adult output stable", () => {
    expect(calcEquipment({
      clinicalMode: "ADULT",
      ageYears: 40,
      weightKg: 80,
      heightCm: 170,
      sex: "FEMALE",
    })).toEqual([
      {
        cat: "Airway", color: "#3b82f6",
        items: [
          { label: "ETT size", value: "7.5", note: "cuffed" },
          { label: "ETT depth (lip)", value: "18 cm" },
          { label: "LMA size", value: "5" },
          { label: "Laryngoscope", value: "Mac 3" },
          { label: "Guedel OPA", value: "Size 5" },
          { label: "Suction catheter", value: "14 Fr" },
        ],
      },
      {
        cat: "Ventilation", color: "#14b8a6",
        items: [
          { label: "Tidal volume", value: "369–492 mL", note: "6–8 mL/kg IBW" },
          { label: "Rate", value: "10–16 /min" },
          { label: "PEEP", value: "5 cmH₂O" },
          { label: "I:E ratio", value: "1:2" },
        ],
      },
      {
        cat: "Fluids", color: "#0ea5e9",
        items: [{ label: "Maintenance", value: "120 mL/hr", note: "4-2-1 rule" }],
      },
      {
        cat: "Catheters", color: "#f59e0b",
        items: [
          { label: "Urinary catheter", value: "12–14 Fr" },
          { label: "NGT", value: "14 Fr", note: "~53 cm insertion depth" },
        ],
      },
      {
        cat: "Monitoring", color: "#22c55e",
        items: [
          { label: "BP cuff", value: "Adult (12–15 cm)" },
          { label: "Defibrillator", value: "Adult pads" },
        ],
      },
    ])
  })

  it("uses exact adult-row parity for pediatric guidance without extra equipment", () => {
    const adult = calcEquipment({ clinicalMode: "ADULT" })
    const pediatric = calcEquipment({
      clinicalMode: "PEDIATRIC",
      age: { value: 6, unit: "YEARS" },
      weightKg: 18,
      heightCm: 115,
      sex: "FEMALE",
    })

    expect(adult.map(category => category.cat)).toEqual(pediatric.map(category => category.cat))
    expect(pediatric.map(category => category.items.map(item => item.label))).toEqual(adultRows)
    expect(pediatric.flatMap(category => category.items).map(item => item.label)).not.toContain("BVM")
  })

  it("does not fabricate pediatric age or weight defaults", () => {
    const categories = calcEquipment({ clinicalMode: "PEDIATRIC" })
    const items = new Map(categories.flatMap(category => category.items.map(item => [item.label, item])))

    expect(items.get("ETT size")?.value).toBe("Manual selection")
    expect(items.get("ETT depth (lip)")?.value).toBe("Manual selection")
    expect(items.get("LMA size")?.value).toBe("Weight required")
    expect(items.get("Tidal volume")?.value).toBe("IBW unavailable")
    expect(items.get("Rate")?.value).toBe("Age required")
    expect(items.get("Maintenance")?.value).toBe("Weight required")
    expect(items.get("Defibrillator")?.value).toBe("Verify AED mode and pad placement")
  })

  it("keeps ETT selection manual below two years and calculates starting estimates from two", () => {
    const infant = calcEquipment({
      clinicalMode: "PEDIATRIC",
      age: { value: 18, unit: "MONTHS" },
      weightKg: 11,
    })
    expect(infant[0]?.items[0]).toMatchObject({
      label: "ETT size",
      value: "Manual selection",
    })
    expect(infant[0]?.items[1]).toMatchObject({
      label: "ETT depth (lip)",
      value: "Manual selection",
    })

    const child = calcEquipment({
      clinicalMode: "PEDIATRIC",
      age: { value: 6, unit: "YEARS" },
      weightKg: 18,
      heightCm: 115,
      sex: "FEMALE",
    })
    expect(child[0]?.items[0]).toMatchObject({
      value: "5.0 cuffed / 5.5 uncuffed",
    })
    expect(child[0]?.items[1]).toMatchObject({ value: "15.0 cm" })
    expect(child[0]?.items[2]).toMatchObject({ value: "Size 2" })
    expect(child[0]?.items[3]?.value).toContain("curved")
  })

  it("uses McLaren IBW only when its inputs are available and never emits defibrillation energy", () => {
    const categories = calcEquipment({
      clinicalMode: "PEDIATRIC",
      age: { value: 10, unit: "YEARS" },
      weightKg: 30,
      heightCm: 140,
      sex: "FEMALE",
    })
    const text = JSON.stringify(categories)
    const tidalVolume = categories[1]?.items[0]

    expect(tidalVolume?.value).toMatch(/^\d+–\d+ mL$/)
    expect(tidalVolume?.note).toBe("6–8 mL/kg McLaren IBW")
    expect(text).not.toContain("J/kg")
    expect(text).not.toContain(" joule")
  })

  it("preserves conditional difficult-airway rows in both modes", () => {
    for (const clinicalMode of ["ADULT", "PEDIATRIC"] as const) {
      const categories = calcEquipment({
        clinicalMode,
        age: clinicalMode === "PEDIATRIC" ? { value: 8, unit: "YEARS" } : null,
        airway: { mallampati: "IV" },
      })
      expect(categories[categories.length - 1]?.items.map(item => item.label)).toEqual([
        "Video laryngoscope",
        "Bougie / stylet",
        "Backup ETT",
        "Difficult airway trolley",
      ])
    }
  })

  it("publishes versioned source metadata with the fixed resolver", () => {
    expect(EQUIPMENT_GUIDANCE_VERSION).toBe("LOSPOR_FIXED_EQUIPMENT_2026_08_01")
    expect(EQUIPMENT_GUIDANCE_SOURCE_REFS.length).toBeGreaterThanOrEqual(5)
  })
})
