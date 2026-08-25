// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "../../../messages/en.json"

vi.mock("@/hooks/useOptionLibrary", () => ({
  useOptionLibrary: () => ({ options: [], loading: false, source: "bundled" }),
  useRange: () => ({ min: 0, max: 300, step: 1, unit: "" }),
}))

vi.mock("@/lib/deployment-capabilities", () => ({
  capabilityMessageKey: () => "deploymentCapabilities.externalAiUnavailable",
  pediatricCapabilityMessageKey: (_capability: unknown, existing: boolean) => existing
    ? "existingRecordReadOnlyUnavailable"
    : "newSelectionUnavailable",
  useClinicalAiCapabilities: () => ({
    clinicalAdvice: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    labImageExtraction: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    monitorOcr: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
  }),
  usePediatricModeCapability: () => ({
    enabled: false,
    reason: "CAPABILITY_UNAVAILABLE",
    productionReady: false,
    rulesetVersion: null,
    minimumClientVersion: null,
    reviewedDoseProfilesRequired: false,
  }),
}))

import { PreopForm } from "./PreopForm"

describe("PreopForm Pediatric recovery boundary", () => {
  it("renders an existing Pediatric pre-op record but blocks every write path", () => {
    const submit = vi.fn()
    const autosave = vi.fn()
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PreopForm
          defaultValues={{
            clinicalMode: "PEDIATRIC",
            ageValue: 5,
            ageUnit: "YEARS",
            ageYears: 5,
            sex: "FEMALE",
          }}
          onSubmit={submit}
          onAutoSave={autosave}
          caseId="existing-pediatric-case"
        />
      </NextIntlClientProvider>,
    )

    expect(screen.getAllByText(/existing Pediatric record remains visible/i).length).toBeGreaterThan(0)
    expect(screen.getByText("Precise age")).toBeTruthy()

    const form = container.querySelector("form") as HTMLFormElement
    const writeBoundary = form.querySelector(":scope > fieldset") as HTMLFieldSetElement
    expect(writeBoundary.disabled).toBe(true)

    const submitButton = screen.getByRole("button", { name: /Continue to intraoperative/i }) as HTMLButtonElement
    expect(submitButton.disabled).toBe(true)
    fireEvent.submit(form)
    expect(submit).not.toHaveBeenCalled()
    expect(autosave).not.toHaveBeenCalled()
  })
})
