import { describe, expect, it } from "vitest"
import { calcEquipment } from "./equipment-calculator"

describe("calcEquipment", () => {
  it("calculates adult airway and ventilation suggestions", () => {
    const categories = calcEquipment(40, 80, 180, "MALE")

    const airway = categories.find(c => c.cat === "Airway")
    const ventilation = categories.find(c => c.cat === "Ventilation")

    expect(airway?.items.find(i => i.label === "ETT size")?.value).toBe("8")
    expect(airway?.items.find(i => i.label === "Laryngoscope")?.value).toBe("Mac 3")
    expect(ventilation?.items.find(i => i.label === "Tidal volume")?.value).toBe("450–600 mL")
  })

  it("adds difficult-airway equipment when exam findings require it", () => {
    const categories = calcEquipment(40, 80, 180, "MALE", { mallampati: "IV" })

    expect(categories.some(c => c.cat === "Difficult Airway")).toBe(true)
  })
})
