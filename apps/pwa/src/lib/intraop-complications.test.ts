import { describe, expect, it } from "vitest"
import { addComplicationLabel, formatComplications, parseComplications, toggleComplicationLabel } from "./intraop-complications"

const KNOWN = ["Hypotension", "Bradycardia", "Desaturation"]

describe("formatComplications", () => {
  it("joins selected items and notes with an em dash", () => {
    expect(formatComplications(["Hypotension", "Bradycardia"], "transient")).toBe("Hypotension; Bradycardia — transient")
  })
  it("handles selected-only / notes-only / neither", () => {
    expect(formatComplications(["Hypotension"], "")).toBe("Hypotension")
    expect(formatComplications([], "free text")).toBe("free text")
    expect(formatComplications([], "   ")).toBeNull()
    expect(formatComplications([], "")).toBeNull()
  })
  it("trims and caps notes at 500 chars", () => {
    expect(formatComplications([], "  x  ")).toBe("x")
    expect(formatComplications([], "a".repeat(600))).toHaveLength(500)
  })
})

describe("parseComplications", () => {
  it("splits selected items and notes on the em dash", () => {
    expect(parseComplications("Hypotension; Bradycardia — transient", KNOWN)).toEqual({ selected: ["Hypotension", "Bradycardia"], notes: "transient" })
  })
  it("treats an all-known list as selected items", () => {
    expect(parseComplications("Hypotension; Bradycardia", KNOWN)).toEqual({ selected: ["Hypotension", "Bradycardia"], notes: "" })
  })
  it("treats unknown content as free-text notes", () => {
    expect(parseComplications("something custom", KNOWN)).toEqual({ selected: [], notes: "something custom" })
  })
  it("round-trips selected + notes", () => {
    const selected = ["Hypotension"], notes = "see chart"
    expect(parseComplications(formatComplications(selected, notes)!, KNOWN)).toEqual({ selected, notes })
  })
})

describe("addComplicationLabel", () => {
  it("adds missing labels and returns null for duplicates", () => {
    expect(addComplicationLabel(["Hypotension"], "Bradycardia")).toEqual(["Hypotension", "Bradycardia"])
    expect(addComplicationLabel(["Hypotension"], "Hypotension")).toBeNull()
  })
})

describe("toggleComplicationLabel", () => {
  it("adds missing labels and removes selected labels", () => {
    expect(toggleComplicationLabel(["Hypotension"], "Bradycardia")).toEqual(["Hypotension", "Bradycardia"])
    expect(toggleComplicationLabel(["Hypotension", "Bradycardia"], "Hypotension")).toEqual(["Bradycardia"])
  })
})
