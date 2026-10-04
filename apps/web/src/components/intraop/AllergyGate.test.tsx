// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useAllergyGate } from "./AllergyGate"

const PREOP = { allergies: true, allergyDetails: [{ label: "Penicillin", source: "ehr" }] }
const propofol = { name: "Propofol", atcCode: "N01AX10" }
const prev: { drugs: { name: string; atcCode?: string }[]; infusions: { name: string; atcCode?: string }[] } = { drugs: [propofol], infusions: [] }

function gate(preop: object = PREOP) {
  return renderHook(() => useAllergyGate({ preop, locale: "en" }))
}

describe("a dose that clashes with a recorded allergy", () => {
  it("asks before adding it, and adds it with the acknowledgement on Give anyway", () => {
    const { result } = gate()
    const apply = vi.fn()
    const ampicillin = { name: "Ampicillin", atcCode: "J01CA01" }

    act(() => result.current.guard(prev, apply)({ drugs: [propofol, ampicillin], infusions: [] }))
    expect(apply).not.toHaveBeenCalled()

    render(<>{result.current.modal}</>)
    expect(screen.getByText(/Penicillin/)).toBeTruthy()
    expect(screen.getByText("Same drug class")).toBeTruthy()
    expect(screen.getByText(/from the hospital system/)).toBeTruthy()

    act(() => { fireEvent.click(screen.getByRole("button", { name: "Give anyway" })) })
    expect(apply).toHaveBeenCalledWith({
      drugs: [propofol, { ...ampicillin, allergyAck: [{ allergy: "Penicillin", level: "same_class" }] }],
      infusions: [],
    })
  })

  it("leaves the chart as it was on Don't give", () => {
    const { result } = gate()
    const apply = vi.fn()
    act(() => result.current.guard(prev, apply)({ drugs: [propofol], infusions: [{ name: "Cefazolin", atcCode: "J01DB04" }] }))
    render(<>{result.current.modal}</>)
    expect(screen.getByText("Possible cross-reaction")).toBeTruthy()

    act(() => { fireEvent.click(screen.getByRole("button", { name: "Don't give" })) })
    expect(apply).not.toHaveBeenCalled()
  })
})

describe("everything else passes straight through", () => {
  it("adds an unrelated drug without asking", () => {
    const { result } = gate()
    const apply = vi.fn()
    const next = { drugs: [propofol, { name: "Ondansetron", atcCode: "A04AA01" }], infusions: [] }
    act(() => result.current.guard(prev, apply)(next))
    expect(apply).toHaveBeenCalledWith(next)
  })

  it("does not ask again about a dose already on the chart or already acknowledged", () => {
    const { result } = gate()
    const apply = vi.fn()
    const given = { name: "Ampicillin", atcCode: "J01CA01", allergyAck: [{ allergy: "Penicillin", level: "same_class" as const }] }
    const unchanged = { name: "Ampicillin", atcCode: "J01CA01" }
    const before = { drugs: [unchanged], infusions: [] }
    act(() => result.current.guard(before, apply)({ drugs: [unchanged, given], infusions: [] }))
    expect(apply).toHaveBeenCalled()
  })

  it("asks nothing for a case with no recorded allergies", () => {
    const { result } = gate({ allergies: false })
    const apply = vi.fn()
    act(() => result.current.guard(prev, apply)({ drugs: [propofol, { name: "Ampicillin", atcCode: "J01CA01" }], infusions: [] }))
    expect(apply).toHaveBeenCalled()
  })
})
