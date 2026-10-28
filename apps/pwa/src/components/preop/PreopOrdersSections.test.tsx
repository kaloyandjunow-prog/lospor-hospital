import React from "react"
import { describe, expect, it, vi } from "vitest"
import { act, type ReactTestRenderer } from "react-test-renderer"
import { render } from "@/test/render"
import { CLINICAL_STRINGS } from "@/i18n/clinical-strings"
import { defaultPreopSectionConfig } from "@lospor/core/preop-orders"
import { PreopMedicationInstructionsSection, PreopWardOrdersSection } from "./PreopOrdersSections"

// The ward orders and medication instructions on the phone (1.7.0), the same
// rules as the web form: "no additional orders" stands alone, a consultation
// is ordered by its specialty, and a stop row carries a drug and the hours.

const tc = (key: string) => (CLINICAL_STRINGS.bg as Record<string, string>)[key] ?? key
const config = defaultPreopSectionConfig("ADULT")

const press = (tree: ReactTestRenderer, testID: string) => act(() => {
  tree.root.find(node => node.props.testID === testID && typeof node.props.onPress === "function").props.onPress()
})
const has = (tree: ReactTestRenderer, testID: string) => tree.root.findAll(node => node.props.testID === testID).length > 0

function wardOrders(value: Array<Record<string, unknown>>) {
  const onChange = vi.fn()
  const tree = render(<PreopWardOrdersSection config={config} value={value as never} onChange={onChange} language="bg" tc={tc as never} />)
  return { tree, onChange }
}

describe("ward orders on the phone", () => {
  it("lets 'no additional orders' stand alone", () => {
    let view = wardOrders([{ optionKey: "CORRECT_ANAEMIA" }])
    press(view.tree, "preop-order-NO_ADDITIONAL_ORDERS")
    expect(view.onChange).toHaveBeenLastCalledWith([{ optionKey: "NO_ADDITIONAL_ORDERS" }])

    view = wardOrders([{ optionKey: "NO_ADDITIONAL_ORDERS" }])
    press(view.tree, "preop-order-CORRECT_ANAEMIA")
    expect(view.onChange).toHaveBeenLastCalledWith([{ optionKey: "CORRECT_ANAEMIA" }])
  })

  it("unticks a row by removing it", () => {
    const { tree, onChange } = wardOrders([{ optionKey: "CORRECT_ANAEMIA" }, { optionKey: "MORNING_SERUM_GLUCOSE" }])
    press(tree, "preop-order-CORRECT_ANAEMIA")
    expect(onChange).toHaveBeenLastCalledWith([{ optionKey: "MORNING_SERUM_GLUCOSE" }])
  })

  it("orders a consultation by its specialty, found by search in the form's language", () => {
    const { tree, onChange } = wardOrders([])
    expect(has(tree, "preop-order-search-CONSULTATION")).toBe(false)
    press(tree, "preop-order-CONSULTATION")
    // The tick alone orders nothing: the specialty is the order.
    expect(onChange).not.toHaveBeenCalled()
    act(() => { tree.root.find(node => node.props.testID === "preop-order-search-CONSULTATION" && node.props.onChangeText).props.onChangeText("кардио") })
    expect(has(tree, "preop-order-pick-CONSULTATION-1020")).toBe(true)
    expect(has(tree, "preop-order-pick-CONSULTATION-1001")).toBe(false)
    press(tree, "preop-order-pick-CONSULTATION-1020")
    expect(onChange).toHaveBeenLastCalledWith([{ optionKey: "CONSULTATION", specialtyKey: "1020" }])
  })

  it("does not offer a specialty already ordered", () => {
    const { tree } = wardOrders([{ optionKey: "CONSULTATION", specialtyKey: "1020" }])
    expect(JSON.stringify(tree.toJSON())).toContain("Кардиология")
    const addButton = tree.root.findAll(node => typeof node.props.onPress === "function" && node.findAll(child => child.children.includes("Добави специалност")).length > 0)[0]
    act(() => { addButton.props.onPress() })
    expect(has(tree, "preop-order-pick-CONSULTATION-1020")).toBe(false)
    expect(has(tree, "preop-order-pick-CONSULTATION-1001")).toBe(true)
  })
})

function instructions(value: Array<Record<string, unknown>>, medications = [{ label: "Metformin", inn: "metformin" }, { label: "Bisoprolol" }]) {
  const onChange = vi.fn()
  const tree = render(<PreopMedicationInstructionsSection config={config} value={value as never} onChange={onChange} medications={medications} language="bg" tc={tc as never} />)
  return { tree, onChange }
}

describe("medication instructions on the phone", () => {
  const stop = { id: "row-1", optionKey: "STOP_BEFORE_SURGERY", medicationLabel: "", medicationInn: null, medicationAtc: null, hoursBefore: 24 }

  it("adds a stop row with a day's hold and no drug yet", () => {
    const { tree, onChange } = instructions([])
    press(tree, "preop-instruction-add-STOP_BEFORE_SURGERY")
    const [row] = onChange.mock.lastCall![0]
    expect(row).toMatchObject({ optionKey: "STOP_BEFORE_SURGERY", medicationLabel: "", hoursBefore: 24 })
    expect(row.id).toMatch(/^[0-9a-f]{32}$/)
    press(tree, "preop-instruction-add-DO_NOT_STOP")
    expect(onChange.mock.lastCall![0][0]).toMatchObject({ optionKey: "DO_NOT_STOP", hoursBefore: null })
  })

  it("picks the drug from the current medications and the hours from the list", () => {
    const { tree, onChange } = instructions([stop])
    press(tree, "preop-instruction-drug-row-1-Metformin")
    expect(onChange).toHaveBeenLastCalledWith([{ ...stop, medicationLabel: "Metformin", medicationInn: "metformin", medicationAtc: null }])
    press(tree, "preop-instruction-hours-row-1-72")
    expect(onChange).toHaveBeenLastCalledWith([{ ...stop, hoursBefore: 72 }])
    // Units in English in every language; the days are a word.
    expect(JSON.stringify(tree.toJSON())).toContain("72 h (3 дни)")
  })

  it("offers no hours on a don't-stop row", () => {
    const { tree } = instructions([{ ...stop, optionKey: "DO_NOT_STOP", hoursBefore: null }])
    expect(has(tree, "preop-instruction-hours-row-1-24")).toBe(false)
  })

  it("flags a drug since taken off the medication list, and keeps it", () => {
    const { tree } = instructions([{ ...stop, medicationLabel: "Warfarin" }])
    expect(has(tree, "instruction-medication-removed")).toBe(true)
    expect(JSON.stringify(tree.toJSON())).toContain("Warfarin вече не е в списъка")
    expect(has(instructions([{ ...stop, medicationLabel: "Metformin", medicationInn: "metformin" }]).tree, "instruction-medication-removed")).toBe(false)
  })

  it("asks for the medications first when there are none", () => {
    const { tree } = instructions([], [])
    expect(JSON.stringify(tree.toJSON())).toContain("Първо добавете приеманите медикаменти")
    expect(has(tree, "preop-instruction-add-STOP_BEFORE_SURGERY")).toBe(false)
  })

  it("removes a row", () => {
    const { tree, onChange } = instructions([stop, { ...stop, id: "row-2" }])
    press(tree, "preop-instruction-remove-row-1")
    expect(onChange).toHaveBeenLastCalledWith([{ ...stop, id: "row-2" }])
  })
})
