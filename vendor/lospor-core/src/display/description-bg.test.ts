import { describe, expect, it } from "vitest"
import { catalogOptions } from "../catalog"
import { localizedOptions } from "../clinical-display"

// Found testing Hospital 1.5.0: on a Bulgarian screen the positions and the
// airway grades kept English descriptions ("Flat on back").
describe("catalogue descriptions in Bulgarian", () => {
  for (const category of ["POSITION", "MALLAMPATI", "UPPER_LIP_BITE", "CORMACK_LEHANE"] as const) {
    it(`gives every ${category} option a Bulgarian description, and keeps English`, () => {
      const options = catalogOptions(category) as never
      const bg = localizedOptions(category, options, "bg")
      const en = localizedOptions(category, options, "en")
      for (const [index, option] of bg.entries()) {
        expect(option.description, option.value).toMatch(/[А-Яа-я]/)
        expect(en[index].description, option.value).not.toMatch(/[А-Яа-я]/)
      }
    })
  }
})
