// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "../../../messages/en.json"

vi.mock("@/hooks/useOptionLibrary", () => ({
  useOptionLibrary: () => ({ options: [], loading: false, source: "bundled" }),
  useRange: () => ({ min: 0, max: 300, step: 1, unit: "" }),
}))

vi.mock("@/lib/deployment-capabilities", () => ({
  capabilityMessageKey: () => "deploymentCapabilities.externalAiUnavailable",
  pediatricCapabilityMessageKey: () => "newSelectionUnavailable",
  useClinicalAiCapabilities: () => ({
    clinicalAdvice: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    labImageExtraction: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    monitorOcr: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
  }),
  usePediatricModeCapability: () => ({
    enabled: false, reason: "CAPABILITY_UNAVAILABLE", productionReady: false,
    rulesetVersion: null, minimumClientVersion: null, reviewedDoseProfilesRequired: false,
  }),
}))

import { PreopForm } from "./PreopForm"

// Everything a submit needs, so only the procedure decides it.
const COMPLETE = {
  clinicalMode: "ADULT", ageYears: 45, sex: "MALE", heightCm: 175, weightKg: 80, diagnoses: [{ label: "Test diagnosis" }],
  bpSystolic: 120, bpDiastolic: 80, heartRate: 70, respiratoryRate: 14, mallampati: "I", asaScore: "II",
}

function renderForm(defaults: Record<string, unknown>) {
  const onSubmit = vi.fn()
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PreopForm defaultValues={{ ...COMPLETE, ...defaults } as never} onSubmit={onSubmit} onAutoSave={vi.fn()} layoutMode="scroll" preopProfile={null} />
    </NextIntlClientProvider>,
  )
  return { ...view, onSubmit }
}
const procedureInput = (container: HTMLElement) =>
  container.querySelector(`input[placeholder="${enMessages.preop.procedurePlaceholder}"]`) as HTMLInputElement | null

describe("a planned procedure not yet known (10.0.0)", () => {
  it("is a tickbox beside the procedure that clears the chosen procedures and sets the search aside", async () => {
    const { container, onSubmit } = renderForm({ procedures: [{ label: "Appendectomy", code: "Appendectomy" }] })
    expect(screen.getAllByText("Appendectomy").length).toBeGreaterThan(0)

    await act(async () => { fireEvent.click(screen.getByTestId("procedure-undetermined")) })
    expect(screen.queryAllByText("Appendectomy")).toHaveLength(0)
    expect(procedureInput(container)?.disabled).toBe(true)

    // It stands for the procedure: the form submits, as not yet known, with none beside it.
    await act(async () => { fireEvent.submit(container.querySelector("form") as HTMLFormElement) })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ procedureUndetermined: true, procedures: [] })
  })

  it("without it, a form with no procedure is not ready to submit", async () => {
    const { container, onSubmit } = renderForm({ procedures: [] })
    await act(async () => { fireEvent.submit(container.querySelector("form") as HTMLFormElement) })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("opens ticked, with the search set aside, for a case saved as not yet known", () => {
    const { container } = renderForm({ procedureUndetermined: true, procedures: [] })
    expect(screen.getByTestId("procedure-undetermined").getAttribute("aria-checked")).toBe("true")
    expect(procedureInput(container)?.disabled).toBe(true)
  })

  it("unticked, gives the search back", async () => {
    const { container } = renderForm({ procedureUndetermined: true, procedures: [] })
    await act(async () => { fireEvent.click(screen.getByTestId("procedure-undetermined")) })
    expect(procedureInput(container)?.disabled).toBe(false)
  })
})
