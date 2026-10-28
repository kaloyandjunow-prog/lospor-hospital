// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { PremedicationOrders } from "@lospor/core/premedication"
import { usePremedicationPrefill } from "./use-premedication-prefill"

type Values = Record<"premedicationEvening" | "premedicationMorning", string | undefined>

function mount(values: Values, ordered: PremedicationOrders | null, readOnly = false) {
  const hook = renderHook(props => usePremedicationPrefill({
    ordered: props.ordered,
    readOnly: props.readOnly,
    getValue: field => values[field],
    setValue: (field, value) => { values[field] = value },
  }), { initialProps: { ordered, readOnly } })
  return {
    values,
    rerender: (next: PremedicationOrders | null) => hook.rerender({ ordered: next, readOnly }),
    setReadOnly: (next: boolean) => hook.rerender({ ordered, readOnly: next }),
  }
}

const ORDER = { DAY_BEFORE: "Midazolam 7.5 mg PO", MORNING: "Pantoprazole 40 mg PO" }

describe("the intraoperative premedication and the preop order", () => {
  it("starts an empty record from what was ordered", () => {
    expect(mount({ premedicationEvening: undefined, premedicationMorning: "" }, ORDER).values)
      .toEqual({ premedicationEvening: "Midazolam 7.5 mg PO", premedicationMorning: "Pantoprazole 40 mg PO" })
  })

  it("leaves a phase someone filled or marked N/A as it is", () => {
    expect(mount({ premedicationEvening: "Diazepam 5 mg PO", premedicationMorning: "N/A" }, ORDER).values)
      .toEqual({ premedicationEvening: "Diazepam 5 mg PO", premedicationMorning: "N/A" })
  })

  it("does not refill a phase emptied on purpose, unless the order changes", () => {
    const { values, rerender } = mount({ premedicationEvening: undefined, premedicationMorning: undefined }, ORDER)
    values.premedicationEvening = ""
    rerender({ ...ORDER })
    expect(values.premedicationEvening).toBe("")
    rerender({ ...ORDER, DAY_BEFORE: "Midazolam 3.75 mg PO" })
    expect(values.premedicationEvening).toBe("Midazolam 3.75 mg PO")
  })

  it("does not refill it when the record is locked and unlocked again", () => {
    const { values, setReadOnly } = mount({ premedicationEvening: undefined, premedicationMorning: undefined }, ORDER)
    values.premedicationEvening = ""
    setReadOnly(true)
    setReadOnly(false)
    expect(values.premedicationEvening).toBe("")
  })

  it("fills an order placed after the record was opened", () => {
    const { values, rerender } = mount({ premedicationEvening: undefined, premedicationMorning: undefined }, { DAY_BEFORE: "", MORNING: "" })
    expect(values.premedicationMorning).toBeUndefined()
    rerender({ DAY_BEFORE: "", MORNING: "Pantoprazole 40 mg PO" })
    expect(values.premedicationMorning).toBe("Pantoprazole 40 mg PO")
  })

  it("never writes to a read-only record", () => {
    expect(mount({ premedicationEvening: undefined, premedicationMorning: undefined }, ORDER, true).values)
      .toEqual({ premedicationEvening: undefined, premedicationMorning: undefined })
  })
})
