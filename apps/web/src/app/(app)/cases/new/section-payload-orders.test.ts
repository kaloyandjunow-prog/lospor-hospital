import { describe, expect, it } from "vitest"
import { sectionPayload } from "@/app/(app)/cases/new/case-record-mapping"
import type { PreopData } from "@/components/forms/PreopForm"

describe("the preop save and medication instructions", () => {
  const picked = { id: "a", optionKey: "STOP_BEFORE_SURGERY", medicationLabel: "Metformin", hoursBefore: 48 }

  it("leaves a row with no drug picked yet out of the save", () => {
    const payload = sectionPayload("preop", { preopMedicationInstructions: [picked, { ...picked, id: "b", medicationLabel: "" }] } as unknown as PreopData)
    expect(payload.preopMedicationInstructions).toEqual([picked])
  })

  it("sends no list when the form holds none, so the stored rows stay", () => {
    expect(sectionPayload("preop", {} as PreopData).preopMedicationInstructions).toBeUndefined()
  })
})

describe("the intraoperative record and the premedication order", () => {
  it("hands the order to the intraoperative screen", async () => {
    const { preopSummaryForIntraop } = await import("@/app/(app)/cases/new/case-record-mapping")
    const orders = { DAY_BEFORE: "Midazolam 7.5 mg PO", MORNING: "" }
    expect(preopSummaryForIntraop({ preopPremedicationOrders: orders } as unknown as PreopData).premedicationOrders).toEqual(orders)
  })
})
