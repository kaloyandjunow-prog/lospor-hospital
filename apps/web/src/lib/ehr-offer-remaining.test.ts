import { describe, expect, it } from "vitest"
import type { EhrImportOffer } from "@lospor/core/ehr-import-transport"
import { offerHasQuestions, offerWithoutAccepted } from "./ehr-offer-remaining"

// A clinician took the age and one allergy, left the weight and the other
// allergy unticked, and asked the hospital again (1.4.17). The appliance still
// holds the import open with those two waiting; the screen used to drop the
// whole second offer and say the hospital held nothing for the patient.

const item = (itemKey: string, state: string) =>
  ({ field: itemKey.split(":")[0], itemKey, state, proposed: itemKey }) as never

const offer = (items: ReturnType<typeof item>[], preselected: string[]): EhrImportOffer => ({
  importId: "imp-1",
  maskedIdentifier: "70*44",
  receivedAt: "2026-09-28T19:00:00.000Z",
  unreadSources: [],
  plan: { items, preselectedKeys: preselected, supersededCountByTest: {}, discardedOlderByTest: {} } as never,
})

const sent = offer([
  item("age", "preselected"),
  item("weight", "preselected"),
  item("allergies:penicillin", "preselected"),
  item("allergies:latex", "preselected"),
  item("height", "unchanged"),
], ["age", "weight", "allergies:penicillin", "allergies:latex"])

describe("an offer asked for again after part of it was accepted", () => {
  it("offers what was left, unticked, and not what was taken", () => {
    const rest = offerWithoutAccepted(sent, new Set(["age", "allergies:penicillin"]))!
    const visible = rest.plan.items.filter(i => i.state !== "unchanged" && i.state !== "declined").map(i => i.itemKey)
    expect(visible).toEqual(["weight", "allergies:latex"])
    expect(rest.plan.preselectedKeys).toEqual([])
    expect(rest.importId).toBe("imp-1")
  })

  it("is nothing once everything the hospital sent was taken", () => {
    expect(offerWithoutAccepted(sent, new Set(["age", "weight", "allergies:penicillin", "allergies:latex"]))).toBeNull()
  })

  it("leaves the offer it was given untouched", () => {
    offerWithoutAccepted(sent, new Set(["age"]))
    expect(sent.plan.preselectedKeys).toHaveLength(4)
    expect(sent.plan.items[0].state).toBe("preselected")
  })
})

describe("whether an offer asks anything", () => {
  it("does not when every item is already in the case or refused", () => {
    expect(offerHasQuestions(offer([item("age", "unchanged"), item("allergies:latex", "declined")], []))).toBe(false)
    expect(offerHasQuestions(sent)).toBe(true)
  })
})
