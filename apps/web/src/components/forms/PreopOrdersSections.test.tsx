// @vitest-environment jsdom

import { useState } from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import { defaultPreopSectionConfig, type PreopSectionConfig } from "@lospor/core/preop-orders"
import enMessages from "../../../messages/en.json"
import bgMessages from "../../../messages/bg.json"
import { PreopMedicationInstructionsSection, PreopWardOrdersSection } from "./PreopOrdersSections"
import type { PreopData } from "./preopSchema"

type Orders = PreopData["preopWardOrders"]
type Instructions = PreopData["preopMedicationInstructions"]

function Wrap({ children, locale = "en" }: { children: React.ReactNode; locale?: "en" | "bg" }) {
  return <NextIntlClientProvider locale={locale} messages={locale === "bg" ? bgMessages : enMessages}>{children}</NextIntlClientProvider>
}

function WardHarness({ config = defaultPreopSectionConfig("ADULT"), initial = [], onChange }: { config?: PreopSectionConfig; initial?: Orders; onChange: (value: Orders) => void }) {
  const [value, setValue] = useState<Orders>(initial)
  return <PreopWardOrdersSection config={config} value={value} onChange={next => { setValue(next); onChange(next) }} />
}

function MedsHarness({ initial = [], medications, onChange }: { initial?: Instructions; medications: { label: string; inn?: string }[]; onChange: (value: Instructions) => void }) {
  const [value, setValue] = useState<Instructions>(initial)
  return <PreopMedicationInstructionsSection config={defaultPreopSectionConfig("ADULT")} value={value} medications={medications} onChange={next => { setValue(next); onChange(next) }} />
}

describe("the ward orders section", () => {
  it("lets 'no additional orders' stand alone, either way round", () => {
    const onChange = vi.fn()
    render(<Wrap><WardHarness onChange={onChange} /></Wrap>)
    fireEvent.click(screen.getByRole("checkbox", { name: "Correct anaemia" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "No additional orders" }))
    expect(onChange).toHaveBeenLastCalledWith([{ optionKey: "NO_ADDITIONAL_ORDERS" }])
    fireEvent.click(screen.getByRole("checkbox", { name: "Correct water balance" }))
    expect(onChange).toHaveBeenLastCalledWith([{ optionKey: "CORRECT_WATER_BALANCE" }])
  })

  it("orders a consultation per specialty chosen, and an investigation per test", () => {
    const onChange = vi.fn()
    render(<Wrap><WardHarness onChange={onChange} /></Wrap>)
    fireEvent.click(screen.getByRole("checkbox", { name: "Consultation with" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Choose a specialty" }), { target: { value: "1004" } })
    expect(onChange).toHaveBeenLastCalledWith([{ optionKey: "CONSULTATION", specialtyKey: "1004" }])
    expect(screen.getByText("Internal diseases")).toBeTruthy()

    fireEvent.click(screen.getByRole("checkbox", { name: "Investigate" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Choose a test" }), { target: { value: "INR" } })
    expect(onChange).toHaveBeenLastCalledWith([{ optionKey: "CONSULTATION", specialtyKey: "1004" }, { optionKey: "INVESTIGATE", labTest: "INR" }])
  })

  it("offers only the specialties the hospital has on", () => {
    const config = { ...defaultPreopSectionConfig("ADULT"), consultSpecialtyKeys: ["1004", "1062"] }
    render(<Wrap><WardHarness config={config} onChange={vi.fn()} /></Wrap>)
    fireEvent.click(screen.getByRole("checkbox", { name: "Consultation with" }))
    const options = within(screen.getByRole("combobox", { name: "Choose a specialty" })).getAllByRole("option").filter(option => !(option as HTMLOptionElement).disabled)
    expect(options.map(option => (option as HTMLOptionElement).value).sort()).toEqual(["1004", "1062"])
  })

  it("keeps an order whose row the hospital has since switched off, in its own words", () => {
    const config = defaultPreopSectionConfig("ADULT")
    config.orderOptions = config.orderOptions.map(option => option.key === "CORRECT_ANAEMIA" ? { ...option, enabled: false } : option)
    render(<Wrap><WardHarness config={config} initial={[{ optionKey: "CORRECT_ANAEMIA", labelEn: "Correct anaemia" }]} onChange={vi.fn()} /></Wrap>)
    expect(screen.queryByRole("checkbox", { name: "Correct anaemia" })).toBeNull()
    expect(screen.getByText("Correct anaemia")).toBeTruthy()
  })

  it("is in Bulgarian, specialties included", () => {
    render(<Wrap locale="bg"><WardHarness onChange={vi.fn()} /></Wrap>)
    expect(screen.getByRole("checkbox", { name: "Без допълнителни назначения" })).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: "Консултация с" }))
    expect(within(screen.getByRole("combobox", { name: "Изберете специалност" })).getByRole("option", { name: "Вътрешни болести" })).toBeTruthy()
  })
})

describe("the medication instructions section", () => {
  const medications = [{ label: "Metformin 500 mg", inn: "metformin" }, { label: "Bisoprolol 5 mg", inn: "bisoprolol" }]

  it("adds a stop with a drug from the current list and hours from the wheel", () => {
    const onChange = vi.fn()
    render(<Wrap><MedsHarness medications={medications} onChange={onChange} /></Wrap>)
    fireEvent.click(screen.getByRole("button", { name: "Add: Stop taking" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Stop taking: Choose a medication" }), { target: { value: "Metformin 500 mg" } })
    fireEvent.change(screen.getByRole("combobox", { name: "Stop taking: Hours before surgery" }), { target: { value: "72" } })
    const [row] = onChange.mock.lastCall![0] as Instructions
    expect(row).toMatchObject({ optionKey: "STOP_BEFORE_SURGERY", medicationLabel: "Metformin 500 mg", medicationInn: "metformin", hoursBefore: 72 })
    expect(row!.id).toBeTruthy()
    expect(screen.getByRole("option", { name: "72 h (3 days)" })).toBeTruthy()
  })

  it("asks no hours of a don't-stop, and adds as many rows as needed", () => {
    const onChange = vi.fn()
    render(<Wrap><MedsHarness medications={medications} onChange={onChange} /></Wrap>)
    fireEvent.click(screen.getByRole("button", { name: "Add: Don't stop taking" }))
    fireEvent.click(screen.getByRole("button", { name: "Add: Don't stop taking" }))
    expect(screen.queryByRole("combobox", { name: "Don't stop taking: Hours before surgery" })).toBeNull()
    expect(onChange.mock.lastCall![0]).toHaveLength(2)
    expect((onChange.mock.lastCall![0] as Instructions).every(row => row.hoursBefore === null)).toBe(true)
  })

  it("warns when the drug has been taken off the current medication list", () => {
    const initial = [{ id: "a", optionKey: "STOP_BEFORE_SURGERY", medicationLabel: "Warfarin", medicationInn: "warfarin", hoursBefore: 120 }]
    render(<Wrap><MedsHarness initial={initial} medications={medications} onChange={vi.fn()} /></Wrap>)
    expect(screen.getByTestId("instruction-medication-removed").textContent).toContain("Warfarin is no longer on the current medication list")
    // Still shown as chosen, not silently replaced.
    expect((screen.getByRole("combobox", { name: "Stop taking: Choose a medication" }) as HTMLSelectElement).value).toBe("Warfarin")
  })

  it("says to list the medications first when there are none", () => {
    render(<Wrap><MedsHarness medications={[]} onChange={vi.fn()} /></Wrap>)
    expect(screen.getByTestId("preop-medication-instructions").textContent).toContain("current medications first")
  })
})
