import { describe, expect, it } from "vitest"
import { catalogOptions, CLINICAL_EVENT_CATS, DISPOSITION } from "./catalog"
import { ALL_COMPLICATIONS, COMPLICATION_CATEGORIES } from "./complications"
import { clinicalDisplayLabel } from "./display"
import { POSTOP_DISPOSITIONS } from "./postop"

/** The vocabulary 10.2.0 (SPS) adds. */
describe("10.2.0 vocabulary", () => {
  const events = (category: string) => CLINICAL_EVENT_CATS.find(cat => cat.cat === category)?.events.map(event => event.label) ?? []

  it("adds Reintubation and both front-of-neck accesses to the airway events", () => {
    expect(events("Airway")).toEqual(expect.arrayContaining(["Reintubation", "Cricothyrotomy", "Needle cricothyrotomy"]))
    expect(clinicalDisplayLabel("option:INTRAOP_EVENT", "AIRWAY_CRICOTHYROTOMY", "bg")).toBe("Крикотомия")
    expect(clinicalDisplayLabel("option:INTRAOP_EVENT", "AIRWAY_NEEDLE_CRICOTHYROTOMY", "bg")).toBe("Иглена крикотомия")
  })

  it("adds a Resuscitation category with the outcome and the MH actions, none of them complications", () => {
    const category = CLINICAL_EVENT_CATS.find(cat => cat.cat === "Resuscitation")!
    expect(category.isComplication).toBeUndefined()
    expect(category.events.map(event => event.label)).toEqual([
      "CPR started", "ROSC", "ROSB", "Death (exitus letalis)", "Charcoal filters fitted", "Active cooling started",
    ])
    expect(clinicalDisplayLabel("option:INTRAOP_EVENT", "RESUSCITATION_DEATH_EXITUS_LETALIS", "bg")).toBe("Exitus letalis (смърт)")
    expect(clinicalDisplayLabel("optionGroup", "Resuscitation", "bg")).toBe("Ресусцитация")
    // Every new event reaches the option library the seed mirrors.
    const values = catalogOptions("INTRAOP_EVENT").map(option => option.value)
    expect(values).toEqual(expect.arrayContaining(["RESUSCITATION_CPR_STARTED", "RESUSCITATION_ROSC", "AIRWAY_REINTUBATION"]))
  })

  it("adds vasoplegia, masseter spasm and methaemoglobinaemia to the complications, with Bulgarian names", () => {
    const groupOf = (name: string) => COMPLICATION_CATEGORIES.find(category => category.items.includes(name))?.id
    expect(groupOf("Vasoplegia")).toBe("cardiovascular")
    expect(groupOf("Masseter spasm")).toBe("drug")
    expect(groupOf("Methaemoglobinaemia")).toBe("haematological")
    for (const name of ["Vasoplegia", "Masseter spasm", "Methaemoglobinaemia"]) expect(ALL_COMPLICATIONS).toContain(name)
    expect(clinicalDisplayLabel("complication", "Masseter spasm", "bg")).toBe("Тризъм (спазъм на масетерите)")
    expect(clinicalDisplayLabel("complication", "Vasoplegia", "bg")).toBe("Вазоплегия")
    expect(clinicalDisplayLabel("complication", "Methaemoglobinaemia", "bg")).toBe("Метхемоглобинемия")
  })

  it("offers Deceased as a postop destination", () => {
    expect(POSTOP_DISPOSITIONS).toContain("DECEASED")
    expect(DISPOSITION.find(option => option.v === "DECEASED")).toMatchObject({ label: "Deceased", labelBg: "Починал" })
    expect(clinicalDisplayLabel("option:DISPOSITION", "DECEASED", "bg")).toBe("Починал")
  })
})
