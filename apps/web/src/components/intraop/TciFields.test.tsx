// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { InfusionDoseFields } from "./InfusionDoseFields"
import { InfusionMenuPopover } from "./InfusionMenuPopover"
import { RateChangeDialog, type RateChangeState } from "./RateChangeDialog"
import { TciPatientContext } from "./tci-patient-context"
import type { TtFP } from "./timetable-types"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

// Target-controlled infusions on the web chart (2026-10-18): the start
// flyout offers Rate or TCI, the change dialog asks for a new target, and the
// menu takes the pump's own total on the stop.
const man40 = { ageYears: 40, weightKg: 70, heightCm: 175, sex: "MALE" as const }
const propofol = {
  col: 0, name: "Propofol", unit: "mg/kg/hr", mode: "infusion", dose: "", doseHint: "",
  rate: 6, rateUnit: "mg/kg/hr", rateUnits: ["mg/kg/hr"], rateMin: 0, rateMax: 15, rateStep: 0.5,
  color: "#3b82f6", quickRates: [4, 6], routes: ["IV"], route: "IV", anchor: {} as never,
} as unknown as TtFP

const doseSurfaces = {
  guidanceEnabled: true,
  infusionRouteSurface: () => undefined,
  clinicalPediatricInfusionFor: () => ({ rule: null, surface: null, conflict: false }),
} as never

function fields(over: Partial<TtFP> = {}, patient: typeof man40 | null = man40) {
  const onConfirm = vi.fn()
  const setFp = vi.fn()
  render(
    <TciPatientContext.Provider value={patient}>
      <InfusionDoseFields
        fp={{ ...propofol, ...over }} setFp={setFp} doseSurfaces={doseSurfaces} isPediatric={false}
        laConcentrations={{}} infusionWeightBasis={{}} ibw={70} tbw={70} onConfirm={onConfirm}
      />
    </TciPatientContext.Provider>,
  )
  return { onConfirm, setFp }
}

describe("the start flyout for a TCI drug", () => {
  it("offers Rate or TCI, and TCI picks the first model at effect site", () => {
    const { setFp } = fields()
    expect(screen.getByRole("button", { name: "Rate" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "TCI" }))
    const next = setFp.mock.calls[0]![0](propofol)
    expect(next.tci).toEqual({ model: "MARSH", site: "EFFECT", opioids: true })
    expect(next.rate).toBeGreaterThan(0)
  })

  it("starts with the target in the model's unit", () => {
    const { onConfirm } = fields({ rate: 4, tci: { model: "SCHNIDER", site: "PLASMA", opioids: true } })
    expect(screen.getByText(/Cp mcg\/mL/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Start TCI/ }))
    expect(onConfirm).toHaveBeenCalledWith({ rate: 4, unit: "mcg/mL" })
  })

  it("says the totals need the patient when the preop lacks them", () => {
    fields({ rate: 4, tci: { model: "SCHNIDER", site: "EFFECT", opioids: true } }, null)
    expect(screen.getByRole("alert").textContent).toMatch(/age, weight, height and sex/)
  })

  it("keeps a drug without a TCI model on its rate fields", () => {
    fields({ name: "Norepinephrine / Noradrenaline", rateUnit: "mcg/kg/min", rateUnits: ["mcg/kg/min"] })
    expect(screen.queryByRole("button", { name: "TCI" })).toBeNull()
  })
})

describe("a TCI target change", () => {
  it("is titled New target", () => {
    const state: RateChangeState = {
      name: "Propofol", rate: 4, unit: "mcg/mL", units: ["mcg/mL"], rateMin: 0.5, rateMax: 8, rateStep: 0.1,
      color: "#3b82f6", step: "rate", timeH: "", timeM: "", tci: true,
    }
    render(
      <RateChangeDialog
        state={state} displayName="Propofol" concentrations={undefined} weightBasis={null} hours={[]} minutes={[]}
        labels={{ setNewRatePrompt: "Enter the recorded rate", pickRateChangeTime: "Pick time", concentration: "Concentration" }}
        onPatch={vi.fn()} onApply={vi.fn()} onConfirmTime={vi.fn()} onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText(/New target/)).toBeTruthy()
  })
})

describe("the pump total on a TCI stop", () => {
  const menu = (stopped: boolean, onDiscontinue = vi.fn(), onSave = vi.fn()) => {
    render(
      <InfusionMenuPopover
        anchor={{ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as never} name="Propofol" color="#3b82f6" stopped={stopped}
        onChangeRate={vi.fn()} onDiscontinue={onDiscontinue} onRestore={vi.fn()} onDiscontinueHover={vi.fn()} onDismiss={vi.fn()}
        pumpTotal={{ amountUnit: "mg", onSave }}
      />,
    )
    return { onDiscontinue, onSave }
  }

  it("goes with Discontinue, in the chosen unit", () => {
    const { onDiscontinue } = menu(false)
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "61.5" } })
    fireEvent.click(screen.getByRole("button", { name: "Discontinue" }))
    expect(onDiscontinue).toHaveBeenCalledWith({ value: 61.5, unit: "mL" })
  })

  it("may be entered after the stop", () => {
    const { onSave } = menu(true)
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "615" } })
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "mg" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(onSave).toHaveBeenCalledWith({ value: 615, unit: "mg" })
  })

  it("refuses a value that is not a number of 0 or more", () => {
    const { onDiscontinue } = menu(false)
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "-3" } })
    expect(screen.getByRole("alert")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Discontinue" }) as HTMLButtonElement).disabled).toBe(true)
    expect(onDiscontinue).not.toHaveBeenCalled()
  })
})
