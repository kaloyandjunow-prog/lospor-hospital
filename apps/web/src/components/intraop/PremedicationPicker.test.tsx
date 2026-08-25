// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PremedicationPicker, type PremDoseCfg, type PremedAnnotation } from "./PremedicationPicker"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

const CATEGORIES = [{ cat: "Analgesics", drugs: ["Paracetamol", "Codeine"] }]

const DOSES: Record<string, PremDoseCfg> = {
  // As the paediatric rebuild hands them over for a 14 kg child, not the adult
  // gram the picker used to show regardless of clinical mode.
  Paracetamol: { dose: 210, unit: "mg", min: 10, max: 1000, step: 10, routes: ["PO", "IV"], defaultRoute: "PO", hint: "15 mg/kg PO" },
  Codeine: { dose: 0, unit: "mg", min: 0, max: 0, step: 1, routes: [], defaultRoute: "PO", hint: "" },
}

const ANNOTATIONS: Record<string, PremedAnnotation> = {
  Paracetamol: { kind: "calculated", perKg: 15, unit: "mg", weightUsedKg: 14, basis: "TBW", capped: false, cap: 1000 },
  Codeine: { kind: "withheld", reason: "Contraindicated in children" },
}

function open(extra: Partial<Parameters<typeof PremedicationPicker>[0]> = {}) {
  render(
    <PremedicationPicker
      label="Evening"
      value=""
      onChange={() => {}}
      categories={CATEGORIES}
      doses={DOSES}
      annotations={ANNOTATIONS}
      prospectiveGuidanceEnabled
      {...extra}
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: /select|evening|—/i }))
}

describe("PremedicationPicker in paediatric mode", () => {
  it("shows a withheld drug with its reason and refuses to open it", () => {
    open()
    fireEvent.click(screen.getByText("Analgesics"))
    expect(screen.getByText("Contraindicated in children")).toBeTruthy()

    const codeine = screen.getByText("Codeine").closest("button")!
    expect(codeine.hasAttribute("disabled")).toBe(true)

    fireEvent.click(codeine)
    // Still on the drug list — no dose panel opened for a withheld drug.
    expect(screen.queryByText(/15 mg\/kg/)).toBeNull()
  })

  it("keeps the calculated prefill, range and arithmetic visible by default", () => {
    open()
    fireEvent.click(screen.getByText("Analgesics"))
    fireEvent.click(screen.getByText("Paracetamol"))
    expect(screen.getByRole("spinbutton")).toHaveProperty("value", "210")
    expect(screen.getAllByText(/15 mg\/kg/).length).toBeGreaterThan(0)
    expect(screen.getByRole("slider")).toBeTruthy()
  })

  it("recomputes the dose when the route changes", () => {
    const doseForRoute = vi.fn((_drug: string, route: string) => route === "IV" ? 180 : 210)
    open({ doseForRoute })

    fireEvent.click(screen.getByText("Analgesics"))
    fireEvent.click(screen.getByText("Paracetamol"))
    // The number field, not the range slider beside it — both carry the value.
    const doseField = screen.getByRole("spinbutton")
    expect(doseField).toHaveProperty("value", "210")

    fireEvent.click(screen.getByRole("button", { name: "IV" }))
    expect(doseForRoute).toHaveBeenCalledWith("Paracetamol", "IV")
    expect(doseField).toHaveProperty("value", "180")
  })

  it("keeps identity and routes but opens empty when the governed baseline is unavailable", () => {
    const doseForRoute = vi.fn(() => 180)
    open({ prospectiveGuidanceEnabled: false, doseForRoute })

    fireEvent.click(screen.getByText("Analgesics"))
    fireEvent.click(screen.getByText("Paracetamol"))
    const doseField = screen.getByRole("spinbutton")
    expect(doseField).toHaveProperty("value", "")
    expect(screen.getByRole("button", { name: "IV" })).toBeTruthy()

    fireEvent.change(doseField, { target: { value: "42" } })
    fireEvent.click(screen.getByRole("button", { name: "IV" }))
    expect(doseField).toHaveProperty("value", "")
    expect(doseForRoute).not.toHaveBeenCalled()
  })
})

describe("PremedicationPicker in adult mode", () => {
  it("is unchanged when no annotations are supplied", () => {
    render(
      <PremedicationPicker label="Evening" value="" onChange={() => {}}
        categories={CATEGORIES} doses={DOSES} prospectiveGuidanceEnabled />,
    )
    fireEvent.click(screen.getByRole("button", { name: /select|evening|—/i }))
    fireEvent.click(screen.getByText("Analgesics"))
    expect(screen.getByText("Codeine").closest("button")!.hasAttribute("disabled")).toBe(false)
    expect(screen.queryByText("Contraindicated in children")).toBeNull()
  })
})
