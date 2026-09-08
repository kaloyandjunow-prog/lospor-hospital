import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { labCodeKeyOf, mappableTests } from "./ehr-lab-code-map"

describe("the key a code is stored under", () => {
  it("is the system and the code together, as a FHIR search writes it", () => {
    expect(labCodeKeyOf("http://hospital.bg/labs", "ХГБ")).toBe("http://hospital.bg/labs|ХГБ")
  })

  it("tolerates a bare code with no system, which a folder drop usually has", () => {
    expect(labCodeKeyOf(null, "HGB")).toBe("|HGB")
    expect(labCodeKeyOf(undefined, "HGB")).toBe("|HGB")
  })

  it("trims only the surrounding whitespace a form adds", () => {
    // The code itself is an opaque token in someone else's namespace. Trimming
    // what a text field appended is safe; case-folding or normalising inside it
    // is a guess about a system we do not own.
    expect(labCodeKeyOf(" http://hospital.bg/labs ", " ХГБ ")).toBe("http://hospital.bg/labs|ХГБ")
    expect(labCodeKeyOf("", "hgb")).not.toBe(labCodeKeyOf("", "HGB"))
  })
})

describe("the list an operator picks from", () => {
  it("offers every test in the library", () => {
    expect(mappableTests().length).toBeGreaterThan(60)
  })

  it("carries the unit, because that is what mapping really decides", () => {
    // Mapping ХГБ to Haemoglobin (Hb) is also saying its results will be read
    // as g/L, and an operator choosing blind cannot know that.
    const haemoglobin = mappableTests().find(test => test.name === "Haemoglobin (Hb)")

    expect(haemoglobin).toMatchObject({ unit: "g/L" })
    expect(haemoglobin?.category).toBeTruthy()
  })

  it("groups them the way the clinical form does, so a name can be found", () => {
    const categories = new Set(mappableTests().map(test => test.category))

    expect(categories.size).toBeGreaterThan(1)
    expect(mappableTests().every(test => test.category)).toBe(true)
  })

  it("names tests we distinguish that a hospital might not", () => {
    // A blood-gas lactate and a laboratory one are different tests here, and an
    // operator must be able to map their two codes to the two of ours rather
    // than being forced to collapse them.
    const names = mappableTests().map(test => test.name)

    expect(names).toContain("Lactate")
    expect(names).toContain("Lactate (ABG)")
  })
})
