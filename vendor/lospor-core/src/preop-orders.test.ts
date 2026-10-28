import { describe, expect, it } from "vitest"
import { buildCanonicalPreopFormPayload } from "./case-payloads"
import {
  BUNDLED_PREOP_ORDER_OPTIONS,
  MEDICATION_HOLD_HOURS,
  defaultPreopSectionConfig,
  holdHoursText,
  instructionsWithRemovedMedication,
  isFormSectionOn,
  medicationInstructionProblems,
  medicationInstructionText,
  preopOrderOptionsFor,
  preopSectionConfigFor,
  preopSectionsFor,
  wardOrderProblems,
  wardOrderText,
  type PreopSectionConfig,
} from "./preop-orders"

const adult = () => defaultPreopSectionConfig("ADULT")

describe("the switchable sections", () => {
  it("offers nil by mouth to children only, and starts with every section on", () => {
    expect(preopSectionsFor("ADULT").map(section => section.key)).not.toContain("PEDIATRIC_FASTING")
    expect(preopSectionsFor("PEDIATRIC").map(section => section.key)).toContain("PEDIATRIC_FASTING")
    expect(Object.values(adult().sections).filter(Boolean)).toHaveLength(preopSectionsFor("ADULT").length)
    expect(adult().sections.PEDIATRIC_FASTING).toBe(false)
  })

  it("turns medication instructions off with the medication list they pick from", () => {
    const config = adult()
    config.sections.CURRENT_MEDICATIONS = false
    const effective = preopSectionConfigFor({ ADULT: config }, "ADULT")
    expect(effective.sections.MEDICATION_INSTRUCTIONS).toBe(false)
    expect(effective.sections.WARD_ORDERS).toBe(true)
  })

  it("falls back to the bundled defaults when a server sends no configuration", () => {
    expect(preopSectionConfigFor(undefined, "PEDIATRIC").sections.PEDIATRIC_FASTING).toBe(true)
  })

  it("stops asking a section's questions when the section is off", () => {
    const config = adult()
    config.sections.MEDICAL_HISTORY = false
    expect(isFormSectionOn(config, "medical_history")).toBe(false)
    expect(isFormSectionOn(config, "anamnesis")).toBe(true)
  })
})

describe("the bundled rows", () => {
  it("lists the ward orders and medication instructions in order, with unique keys", () => {
    const keys = BUNDLED_PREOP_ORDER_OPTIONS.map(option => option.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(preopOrderOptionsFor(adult(), "WARD_ORDER").map(option => option.key)).toEqual([
      "NO_ADDITIONAL_ORDERS", "CORRECT_ELECTROLYTES", "CORRECT_WATER_BALANCE", "CORRECT_ANAEMIA",
      "CORRECT_HYPOPROTEINAEMIA", "CORRECT_ACID_BASE", "CONSULTATION", "MORNING_SERUM_GLUCOSE", "INVESTIGATE",
    ])
    expect(preopOrderOptionsFor(adult(), "MEDICATION_INSTRUCTION").map(option => option.key)).toEqual(["STOP_BEFORE_SURGERY", "DO_NOT_STOP"])
  })

  it("leaves a switched-off row off the form", () => {
    const config = adult()
    config.orderOptions = config.orderOptions.map(option => option.key === "CORRECT_ANAEMIA" ? { ...option, enabled: false } : option)
    expect(preopOrderOptionsFor(config, "WARD_ORDER").map(option => option.key)).not.toContain("CORRECT_ANAEMIA")
  })

  it("offers every hour of the first day and the long holds, none above two weeks", () => {
    expect(MEDICATION_HOLD_HOURS.slice(0, 24)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1))
    expect(MEDICATION_HOLD_HOURS).toContain(72)
    expect(Math.max(...MEDICATION_HOLD_HOURS)).toBe(336)
  })
})

describe("checking a case's ward orders", () => {
  it("accepts ordinary orders", () => {
    expect(wardOrderProblems([
      { optionKey: "CORRECT_ELECTROLYTES" },
      { optionKey: "CONSULTATION", specialtyKey: "1004" },
      { optionKey: "INVESTIGATE", labTest: "Potassium (K⁺)" },
      { optionKey: "MORNING_SERUM_GLUCOSE" },
    ], adult())).toEqual([])
  })

  it("does not let 'no additional orders' stand beside an order", () => {
    expect(wardOrderProblems([{ optionKey: "NO_ADDITIONAL_ORDERS" }, { optionKey: "CORRECT_ANAEMIA" }], adult()))
      .toContainEqual({ code: "NONE_WITH_OTHERS" })
    expect(wardOrderProblems([{ optionKey: "NO_ADDITIONAL_ORDERS" }], adult())).toEqual([])
  })

  it("wants a specialty the hospital offers, and a bundled lab test", () => {
    expect(wardOrderProblems([{ optionKey: "CONSULTATION" }], adult())).toContainEqual({ code: "SPECIALTY_REQUIRED", optionKey: "CONSULTATION" })
    // 1062 is in CL006 but not a clinical doctor specialty, so it is off until a hospital adds it.
    expect(wardOrderProblems([{ optionKey: "CONSULTATION", specialtyKey: "1062" }], adult())).toContainEqual({ code: "UNKNOWN_SPECIALTY", specialtyKey: "1062" })
    expect(wardOrderProblems([{ optionKey: "INVESTIGATE" }], adult())).toContainEqual({ code: "LAB_REQUIRED", optionKey: "INVESTIGATE" })
    expect(wardOrderProblems([{ optionKey: "INVESTIGATE", labTest: "Unicorn" }], adult())).toContainEqual({ code: "UNKNOWN_LAB", labTest: "Unicorn" })
  })

  it("refuses a row the hospital switched off, unless the case already holds it", () => {
    const config: PreopSectionConfig = { ...adult(), orderOptions: adult().orderOptions.map(option => option.key === "CORRECT_ANAEMIA" ? { ...option, enabled: false } : option) }
    expect(wardOrderProblems([{ optionKey: "CORRECT_ANAEMIA" }], config)).toContainEqual({ code: "UNKNOWN_OPTION", optionKey: "CORRECT_ANAEMIA" })
    expect(wardOrderProblems([{ optionKey: "CORRECT_ANAEMIA" }], config, new Set(["CORRECT_ANAEMIA||"]))).toEqual([])
  })

  it("refuses the same order twice and a medication row in the ward list", () => {
    expect(wardOrderProblems([{ optionKey: "CORRECT_ANAEMIA" }, { optionKey: "CORRECT_ANAEMIA" }], adult())).toContainEqual({ code: "DUPLICATE_ORDER", optionKey: "CORRECT_ANAEMIA" })
    expect(wardOrderProblems([{ optionKey: "STOP_BEFORE_SURGERY" }], adult())).toContainEqual({ code: "WRONG_LIST", optionKey: "STOP_BEFORE_SURGERY" })
  })
})

describe("checking a case's medication instructions", () => {
  const stop = { id: "a", optionKey: "STOP_BEFORE_SURGERY", medicationLabel: "Metformin", hoursBefore: 48 }

  it("wants hours on a stop and none on a don't-stop", () => {
    expect(medicationInstructionProblems([stop], adult())).toEqual([])
    expect(medicationInstructionProblems([{ ...stop, hoursBefore: null }], adult())).toContainEqual({ code: "HOURS_REQUIRED", id: "a" })
    expect(medicationInstructionProblems([{ ...stop, optionKey: "DO_NOT_STOP" }], adult())).toContainEqual({ code: "HOURS_NOT_TAKEN", id: "a" })
    expect(medicationInstructionProblems([{ ...stop, optionKey: "DO_NOT_STOP", hoursBefore: null }], adult())).toEqual([])
  })

  it("keeps the hours whole and within two weeks", () => {
    for (const hoursBefore of [0, 1.5, 337]) {
      expect(medicationInstructionProblems([{ ...stop, hoursBefore }], adult()), String(hoursBefore)).toContainEqual({ code: "HOURS_OUT_OF_RANGE", id: "a" })
    }
    expect(medicationInstructionProblems([{ ...stop, hoursBefore: 336 }], adult())).toEqual([])
  })

  it("wants a drug, and one id per row", () => {
    expect(medicationInstructionProblems([{ ...stop, medicationLabel: " " }], adult())).toContainEqual({ code: "MEDICATION_REQUIRED", id: "a" })
    expect(medicationInstructionProblems([stop, stop], adult())).toContainEqual({ code: "DUPLICATE_ID", id: "a" })
  })

  it("keeps a row with no drug yet off the save", () => {
    const blank = { ...stop, id: "b", medicationLabel: "" }
    expect(buildCanonicalPreopFormPayload({ preopMedicationInstructions: [stop, blank] }).preopMedicationInstructions).toEqual([stop])
    // A save without the list leaves the stored rows alone, so none is added.
    expect(buildCanonicalPreopFormPayload({ sex: "MALE" })).not.toHaveProperty("preopMedicationInstructions")
  })

  it("warns about a drug taken off the current medication list", () => {
    const rows = [
      { id: "a", medicationLabel: "Metformin 500 mg", medicationInn: "metformin" },
      { id: "b", medicationLabel: "Bisoprolol", medicationInn: null },
    ]
    expect(instructionsWithRemovedMedication(rows, [{ label: "Metformin 1000 mg", inn: "Metformin" }, { label: "bisoprolol" }])).toEqual([])
    expect(instructionsWithRemovedMedication(rows, [{ label: "Bisoprolol" }]).map(row => row.id)).toEqual(["a"])
  })
})

describe("the text each row prints", () => {
  it("names the specialty and the picked test, in either language", () => {
    const consult = { optionKey: "CONSULTATION", kind: "CONSULT" as const, labelEn: "Consultation with", labelBg: "Консултация с", specialtyLabelEn: "Cardiology", specialtyLabelBg: "Кардиология", labTest: null }
    expect(wardOrderText(consult, "en")).toBe("Consultation with Cardiology")
    expect(wardOrderText(consult, "bg")).toBe("Консултация с Кардиология")
    const lab = { optionKey: "INVESTIGATE", kind: "LAB" as const, labelEn: "Investigate", labelBg: "Изследване на", specialtyLabelEn: null, specialtyLabelBg: null, labTest: "INR" }
    expect(wardOrderText(lab, "en")).toBe("Investigate INR")
    const glucose = { ...lab, optionKey: "MORNING_SERUM_GLUCOSE", labelEn: "Serum glucose on the morning of surgery", labTest: "Glucose" }
    expect(wardOrderText(glucose, "en")).toBe("Serum glucose on the morning of surgery")
  })

  it("says the hold in hours, with days for whole days past the first two, units Latin in Bulgarian too", () => {
    expect(holdHoursText(12, "en")).toBe("12 h")
    expect(holdHoursText(36, "en")).toBe("36 h")
    expect(holdHoursText(72, "en")).toBe("72 h (3 days)")
    expect(holdHoursText(72, "bg")).toBe("72 h (3 дни)")
    const stop = { labelEn: "Stop taking", labelBg: "Спрете приема на", medicationLabel: "Metformin", hoursBefore: 48 }
    expect(medicationInstructionText(stop, "en")).toBe("Stop taking Metformin 48 h (2 days) before surgery")
    expect(medicationInstructionText(stop, "bg")).toBe("Спрете приема на Metformin 48 h (2 дни) преди операцията")
    expect(medicationInstructionText({ ...stop, labelEn: "Don't stop taking", hoursBefore: null }, "en")).toBe("Don't stop taking Metformin")
  })
})
