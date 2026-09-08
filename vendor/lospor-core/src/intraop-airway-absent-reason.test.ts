import { describe, expect, it } from "vitest"
import { airwayAbsentReason, buildAirwaySectionPatch } from "./intraop-domain"

describe("the two reasons an airway section can be empty", () => {
  const none = { presentsIntubated: false, airwayNotApplicable: false }

  it("turns one on", () => {
    expect(airwayAbsentReason("presentsIntubated", none))
      .toEqual({ presentsIntubated: true, airwayNotApplicable: false })
    expect(airwayAbsentReason("airwayNotApplicable", none))
      .toEqual({ presentsIntubated: false, airwayNotApplicable: true })
  })

  it("lets both be true, because both can be", () => {
    // The case that proves it: a patient arrives from the ICU already
    // intubated and ventilated, and the anaesthetist does not touch the
    // airway. A tube is in place AND this team performed no airway
    // intervention. The two answer different questions -- who placed the
    // airway, and whether this team did anything to it.
    expect(airwayAbsentReason("airwayNotApplicable", { presentsIntubated: true, airwayNotApplicable: false }))
      .toEqual({ presentsIntubated: true, airwayNotApplicable: true })
    expect(airwayAbsentReason("presentsIntubated", { presentsIntubated: false, airwayNotApplicable: true }))
      .toEqual({ presentsIntubated: true, airwayNotApplicable: true })
  })

  it("turning one off leaves the other alone", () => {
    expect(airwayAbsentReason("presentsIntubated", { presentsIntubated: true, airwayNotApplicable: true }))
      .toEqual({ presentsIntubated: false, airwayNotApplicable: true })
    expect(airwayAbsentReason("airwayNotApplicable", { presentsIntubated: true, airwayNotApplicable: true }))
      .toEqual({ presentsIntubated: true, airwayNotApplicable: false })
  })

  it("treats absent flags as off", () => {
    expect(airwayAbsentReason("presentsIntubated", {}))
      .toEqual({ presentsIntubated: true, airwayNotApplicable: false })
  })

  it("writes explicit false into the patch rather than omitting the key", () => {
    // An absent key is dropped from a patch as "not mentioned", so a flag
    // turned back off would silently keep its previous true.
    const patch = buildAirwaySectionPatch({ airwayTools: [], airwayDevices: [], ventilationModes: [] })
    expect(patch).toHaveProperty("presentsIntubated", false)
    expect(patch).toHaveProperty("airwayNotApplicable", false)
  })
})
