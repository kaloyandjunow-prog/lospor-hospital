import { describe, expect, it } from "vitest"

import {
  DEFAULT_CONSULT_SPECIALTY_KEYS,
  NHIS_SPECIALTIES,
  NHIS_SPECIALTY_BY_KEY,
  specialtyLabel,
} from "./nhis-specialties"

describe("the NHIS specialty list (CL006)", () => {
  it("has unique keys and an English and a Bulgarian name for every entry", () => {
    expect(NHIS_SPECIALTIES).toHaveLength(168)
    expect(NHIS_SPECIALTY_BY_KEY.size).toBe(168)
    // "No specialty" is a placeholder in the list, not something to consult.
    expect(NHIS_SPECIALTY_BY_KEY.has("0000")).toBe(false)
    expect(NHIS_SPECIALTIES.filter(item => !item.labelEn || !item.labelBg)).toEqual([])
  })

  it("turns on the 61 clinical doctor specialties and nothing else by default", () => {
    expect(DEFAULT_CONSULT_SPECIALTY_KEYS).toHaveLength(61)
    for (const key of DEFAULT_CONSULT_SPECIALTY_KEYS) {
      const item = NHIS_SPECIALTY_BY_KEY.get(key)!
      expect(item.clinical && item.role === "Лекари", key).toBe(true)
    }
    // Dentists, nurses and non-clinical doctor entries are listed, but off.
    expect(DEFAULT_CONSULT_SPECIALTY_KEYS).not.toContain("1062")
    expect(NHIS_SPECIALTY_BY_KEY.get("1062")?.clinical).toBe(false)
  })

  it("names a specialty in the language asked for", () => {
    expect(specialtyLabel("1020", "en")).toBe("Cardiology")
    expect(specialtyLabel("1020", "bg")).toBe("Кардиология")
    expect(specialtyLabel("0000", "en")).toBeNull()
  })
})
