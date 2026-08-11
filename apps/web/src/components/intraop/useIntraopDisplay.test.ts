import { describe, expect, it } from "vitest"
import { splitFluidLaneLabel } from "./useIntraopDisplay"

/**
 * Fluid lane labels carry a group and a line number — "Crystalloid 2" — because
 * a case can run several bags of the same fluid at once. Only the group is a
 * clinical term to be translated.
 *
 * Getting this wrong does not throw. It leaves an untranslated lane header on a
 * Bulgarian screen, which reads as a missing translation rather than a bug, and
 * that is the kind of thing nobody reports.
 */
describe("splitFluidLaneLabel", () => {
  it("separates the clinical group from the line number", () => {
    expect(splitFluidLaneLabel("Crystalloid 2")).toEqual({ group: "Crystalloid", index: "2" })
  })

  it("keeps multi-word groups whole", () => {
    expect(splitFluidLaneLabel("Packed red cells 10"))
      .toEqual({ group: "Packed red cells", index: "10" })
  })

  it("returns nothing for a label with no line number, so the whole label is translated", () => {
    expect(splitFluidLaneLabel("Crystalloid")).toBeNull()
    expect(splitFluidLaneLabel("")).toBeNull()
  })

  it("does not treat a number inside the name as a line number", () => {
    // "Glucose 5%" is the fluid, not the fifth line of anything. The percent
    // sign is what keeps the digits from ending the label.
    expect(splitFluidLaneLabel("Glucose 5%")).toBeNull()
  })

  it("splits on the last number when the group itself contains one", () => {
    expect(splitFluidLaneLabel("Glucose 5% 3")).toEqual({ group: "Glucose 5%", index: "3" })
  })
})
