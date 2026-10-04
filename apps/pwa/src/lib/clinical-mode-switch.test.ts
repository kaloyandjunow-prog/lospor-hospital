import { describe, expect, it } from "vitest"
import { applyEhrImportToForm } from "./clinical-mode-switch"

/**
 * An accepted EHR import whose age belongs to the other mode (1.4.23). The
 * order is the whole point: the mode switch clears that mode's vitals, so it
 * must run before the import is written, or it wipes what was just imported.
 */

function form(initial: Record<string, unknown>) {
  const values: Record<string, unknown> = { ...initial }
  const order: string[] = []
  return {
    values,
    order,
    getValues: (field: string) => values[field],
    setValue: (field: string, value: unknown) => {
      values[field] = value
      order.push(field)
    },
  }
}

describe("an accepted EHR import that switches the mode", () => {
  it("switches to paediatric first, then keeps every imported value", () => {
    const f = form({ clinicalMode: "ADULT", heartRate: 80, respiratoryRate: 14, aiOptIn: true })

    applyEhrImportToForm(
      { ageValue: 7, ageUnit: "YEARS", ageYears: 7, heartRate: 102, bpSystolic: 118 },
      "PEDIATRIC",
      f.getValues,
      f.setValue,
    )

    expect(f.values).toMatchObject({
      clinicalMode: "PEDIATRIC",
      ageValue: 7, ageUnit: "YEARS", ageYears: 7,
      heartRate: 102, bpSystolic: 118,
      aiOptIn: false,
    })
    // What the toggle clears and the import did not bring stays cleared.
    expect(f.values.respiratoryRate).toBeUndefined()
    expect(f.order.indexOf("clinicalMode")).toBeLessThan(f.order.lastIndexOf("heartRate"))
  })

  it("switches to adult and clears the paediatric record the toggle clears", () => {
    const f = form({
      clinicalMode: "PEDIATRIC", ageValue: 7, ageUnit: "MONTHS", ageYears: 0,
      pediatricFasting: [{ kind: "CLEAR" }], coldsApplicable: true,
    })

    applyEhrImportToForm({ ageYears: 40, ageValue: null, ageUnit: null }, "ADULT", f.getValues, f.setValue)

    expect(f.values).toMatchObject({
      clinicalMode: "ADULT", ageYears: 40, ageValue: null, ageUnit: null,
      pediatricFasting: [], coldsApplicable: false,
    })
  })

  it("writes the import alone when the mode already fits", () => {
    const f = form({ clinicalMode: "PEDIATRIC", heartRate: 90 })

    applyEhrImportToForm({ weightKg: 22 }, null, f.getValues, f.setValue)

    expect(f.order).toEqual(["weightKg"])
    expect(f.values.heartRate).toBe(90)
  })
})
