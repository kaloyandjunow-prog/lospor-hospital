import { describe, expect, it } from "vitest"
import { calcEquipment, type EquipInput } from "@/lib/equipment-calculator"
import {
  EQUIPMENT_CATEGORIES_BG,
  EQUIPMENT_LABELS_BG,
  EQUIPMENT_NOTES_BG,
  EQUIPMENT_VALUES_BG,
  isUnitOnlyPhrase,
  translateEquipment,
} from "./equipment-strings"

/**
 * Sweeps the input space so the assertions below see every phrase
 * `calcEquipment` can produce, rather than the handful one sample case happens
 * to hit. If core rewords a string, the coverage test fails here instead of the
 * phrase silently appearing in English on a Bulgarian screen.
 */
const CASES: EquipInput[] = []
for (const clinicalMode of ["ADULT", "PEDIATRIC"] as const) {
  for (const ageYears of [null, 0.05, 0.5, 1, 3, 8, 17, 40, 80]) {
    for (const weightKg of [null, 3, 12, 22, 32, 70, 120]) {
      for (const heightCm of [null, 50, 132, 170, 190]) {
        for (const sex of [null, "MALE", "FEMALE"]) {
          for (const bmi of [null, 22, 32, 42]) {
            for (const airway of [
              null,
              { mallampati: 4, neckMobility: "REDUCED", mouthOpeningCm: 2, cormackLehane: 4 },
            ]) {
              CASES.push({
                clinicalMode, ageYears, weightKg, heightCm, sex, bmi,
                airway: airway as EquipInput["airway"],
              })
            }
          }
        }
      }
    }
  }
}

function emitted() {
  const cats = new Set<string>()
  const labels = new Set<string>()
  const values = new Set<string>()
  const notes = new Set<string>()
  for (const input of CASES) {
    for (const category of calcEquipment(input)) {
      cats.add(category.cat)
      for (const item of category.items) {
        labels.add(item.label)
        values.add(item.value)
        if (item.note) notes.add(item.note)
      }
    }
  }
  return { cats, labels, values, notes }
}

describe("every phrase core can emit has a Bulgarian rendering", () => {
  const { cats, labels, values, notes } = emitted()

  it("covers every category", () => {
    expect([...cats].filter(text => !EQUIPMENT_CATEGORIES_BG[text])).toEqual([])
  })

  it("covers every label", () => {
    expect([...labels].filter(text => !EQUIPMENT_LABELS_BG[text])).toEqual([])
  })

  it("covers every value that is not purely numeric", () => {
    const untranslated = [...values].filter(text =>
      !EQUIPMENT_VALUES_BG[text]
      && !isUnitOnlyPhrase(text)
      && translateEquipment(
        [{ cat: "Airway", color: "#000", items: [{ label: "x", value: text }] }],
        "bg",
      )[0].items[0].value === text)
    expect(untranslated).toEqual([])
  })

  it("covers every note", () => {
    const untranslated = [...notes].filter(text =>
      !EQUIPMENT_NOTES_BG[text]
      && translateEquipment(
        [{ cat: "Airway", color: "#000", items: [{ label: "x", value: "y", note: text }] }],
        "bg",
      )[0].items[0].note === text)
    expect(untranslated).toEqual([])
  })
})

describe("translateEquipment", () => {
  const sample = [{
    cat: "Catheters",
    color: "#f59e0b",
    items: [
      { label: "Urinary catheter", value: "Select manually", note: "Confirm size and insertion depth clinically" },
      { label: "ETT size", value: "4.5 cuffed / 5.0 uncuffed", note: "cuffed" },
      { label: "ETT depth (lip)", value: "20.5 cm" },
    ],
  }]

  it("leaves English alone", () => {
    expect(translateEquipment(sample, "en")).toBe(sample)
  })

  it("translates label, prose value and note", () => {
    const [category] = translateEquipment(sample, "bg")
    expect(category.cat).toBe("Катетри")
    expect(category.items[0].label).toBe("Уринарен катетър")
    expect(category.items[0].value).toBe("Изберете ръчно")
    expect(category.items[0].note).toBe("Потвърдете размера и дълбочината на въвеждане клинично")
  })

  it("keeps the numbers in an interpolated value and translates only the words", () => {
    const [category] = translateEquipment(sample, "bg")
    expect(category.items[1].value).toBe("4.5 с маншет / 5.0 без маншет")
  })

  it("leaves a pure measurement untouched", () => {
    const [category] = translateEquipment(sample, "bg")
    expect(category.items[2].value).toBe("20.5 cm")
  })

  it("passes an unrecognised phrase through rather than dropping it", () => {
    const [category] = translateEquipment(
      [{ cat: "Airway", color: "#000", items: [{ label: "Something new", value: "Not in the table" }] }],
      "bg",
    )
    expect(category.items[0].label).toBe("Something new")
    expect(category.items[0].value).toBe("Not in the table")
  })
})
