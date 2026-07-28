import { describe, expect, it } from "vitest"
import { addOrReplacePremedicationEntry, buildPremedicationPatch, formatPremedicationEntry } from "./intraop-premedication"

describe("formatPremedicationEntry", () => {
  it("formats selected premedication values", () => {
    expect(formatPremedicationEntry({ name: "Midazolam", unit: "mg" }, "7.5", "PO"))
      .toBe("Midazolam 7.5 mg PO")
  })
})

describe("addOrReplacePremedicationEntry", () => {
  it("appends a new entry to an empty or existing semicolon list", () => {
    expect(addOrReplacePremedicationEntry("", "Midazolam", "Midazolam 7.5 mg PO"))
      .toBe("Midazolam 7.5 mg PO")
    expect(addOrReplacePremedicationEntry(
      "Omeprazole 20 mg PO",
      "Midazolam",
      "Midazolam 7.5 mg PO",
    )).toBe("Omeprazole 20 mg PO; Midazolam 7.5 mg PO")
  })

  it("replaces an existing entry for the same drug and trims empty parts", () => {
    expect(addOrReplacePremedicationEntry(
      " Midazolam 3.75 mg PO ; ; Omeprazole 20 mg PO ",
      "Midazolam",
      "Midazolam 7.5 mg PO",
    )).toBe("Omeprazole 20 mg PO; Midazolam 7.5 mg PO")
  })
})

describe("buildPremedicationPatch", () => {
  it("trims text and stores empty values as null", () => {
    expect(buildPremedicationPatch(" Midazolam 7.5 mg PO ", "  ")).toEqual({
      premedicationEvening: "Midazolam 7.5 mg PO",
      premedicationMorning: null,
    })
  })

  it("uses explicit overrides when provided", () => {
    expect(buildPremedicationPatch("old evening", "old morning", { evening: "new evening" })).toEqual({
      premedicationEvening: "new evening",
      premedicationMorning: "old morning",
    })
    expect(buildPremedicationPatch("old evening", "old morning", { morning: null })).toEqual({
      premedicationEvening: "old evening",
      premedicationMorning: null,
    })
  })
})
