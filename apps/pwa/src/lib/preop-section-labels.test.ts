import { describe, expect, it } from "vitest"
import { localizedPreopSectionLabels } from "./preop-section-labels"

// The preop sections in the order of the visit (10.0.0): the assessment, then
// what follows from it: the plan, premedication, nil by mouth and the orders.
describe("the preop section order", () => {
  it("puts the plan and the orders after the risk scores", () => {
    const keys = localizedPreopSectionLabels(key => key).map(section => section.key)
    expect(keys).toEqual([
      "patient", "case", "history", "meds", "anamnesis", "exam", "airway", "labs",
      "risk", "planned", "premedication", "fasting", "wardOrders", "medInstructions",
    ])
  })
})
