import { describe, expect, it } from "vitest"
import { FLUID_CATALOG } from "./intraop-fluids"
import { INTRAOP_FLUID_CONCEPT_IDS, intraopFluidConcept } from "./fluid-concepts"

const drug = (conceptId: number) => ({ table: "drug", conceptId })

describe("intraopFluidConcept", () => {
  it("codes every catalogue fluid at its default strength", () => {
    // Mannitol offers two strengths and preselects neither, so it needs one.
    const uncoded = FLUID_CATALOG
      .filter(entry => !intraopFluidConcept({ name: entry.name, category: entry.category }))
      .map(entry => entry.name)
    expect(uncoded).toEqual(["Mannitol"])
  })

  it("tells apart the fluids that share an ATC code", () => {
    expect(intraopFluidConcept({ name: "Saline" })).toEqual(drug(19079524))
    expect(intraopFluidConcept({ name: "Lactated Ringer's / Hartmann's" })).toEqual(drug(43027244))
    expect(intraopFluidConcept({ name: "Plasma-Lyte" })).toEqual(drug(19131116))
    expect(intraopFluidConcept({ name: "Ringer's acetate" })).toEqual(drug(36887858))
    expect(intraopFluidConcept({ name: "Dextrose 5% in 0.45% saline (D5 1/2NS)" })).toEqual(drug(42481294))
  })

  it("reads the strength from the picker, then the name, then the catalogue default", () => {
    expect(intraopFluidConcept({ name: "Saline", concentration: "3%" })).toEqual(drug(42482740))
    expect(intraopFluidConcept({ name: "Saline", concentration: "0,45 %" })).toEqual(drug(36894518))
    expect(intraopFluidConcept({ name: "Saline 20%" })).toEqual(drug(36894513))
    expect(intraopFluidConcept({ name: "HES" })).toEqual(drug(40161356))
    expect(intraopFluidConcept({ name: "HES", concentration: "6%" })).toEqual(drug(43012054))
    expect(intraopFluidConcept({ name: "Mannitol", concentration: "15%" })).toEqual(drug(36883846))
    expect(intraopFluidConcept({ name: "Albumin 20%" })).toEqual(drug(42481519))
    // A strength the table has no concept for is not rounded to one it has.
    expect(intraopFluidConcept({ name: "Saline", concentration: "7.5%" })).toBeUndefined()
  })

  it("codes blood products as a product and its transfusion", () => {
    expect(intraopFluidConcept({ name: "Packed red blood cells (PRBC)", category: "Blood products" }))
      .toEqual({ table: "device", conceptId: 4336080, transfusionConceptId: 4323715 })
    expect(intraopFluidConcept({ name: "PRBC" })?.conceptId).toBe(4336080)
    expect(intraopFluidConcept({ name: "Fresh frozen plasma (FFP)" })?.conceptId).toBe(4223728)
    expect(intraopFluidConcept({ name: "Platelets" })?.conceptId).toBe(4103615)
    expect(intraopFluidConcept({ name: "Cryoprecipitate" })?.conceptId).toBe(4106319)
    expect(intraopFluidConcept({ name: "Whole blood" })?.conceptId).toBe(4046508)
    // Salvaged blood is red cells too; it must not be read as a donor unit.
    expect(intraopFluidConcept({ name: "Cell salvage / autologous blood", category: "Blood products" }))
      .toEqual({ table: "procedure", conceptId: 4037780 })
  })

  it("never guesses", () => {
    expect(intraopFluidConcept({ name: "Ringer" })).toBeUndefined()
    expect(intraopFluidConcept({ name: "Unknown product", category: "Blood products" })).toBeUndefined()
    expect(intraopFluidConcept({ name: null })).toBeUndefined()
  })

  it("lists each concept once", () => {
    expect(new Set(INTRAOP_FLUID_CONCEPT_IDS).size).toBe(INTRAOP_FLUID_CONCEPT_IDS.length)
    expect(INTRAOP_FLUID_CONCEPT_IDS).toHaveLength(33)
  })
})
