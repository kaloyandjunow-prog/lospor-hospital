// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "../../../messages/en.json"

// jsdom does not implement scrollIntoView. The appliance's form additionally
// requires a hospital record number, so an invalid submit here reaches the
// jump-to-first-error path that upstream's own fixture never exercised.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

vi.mock("@/hooks/useOptionLibrary", () => ({
  useOptionLibrary: () => ({ options: [], loading: false, source: "bundled" }),
  useRange: () => ({ min: 0, max: 300, step: 1, unit: "" }),
}))

vi.mock("@/lib/deployment-capabilities", () => ({
  capabilityMessageKey: () => "deploymentCapabilities.externalAiUnavailable",
  pediatricCapabilityMessageKey: () => "newSelectionUnavailable",
  // Appliance-only: PreopForm reads it to decide whether to offer the
  // hospital's own data. Off here, so this test sees the plain form.
  useEhrImportCapability: () => ({
    enabled: false,
    reason: "PROVIDER_NOT_CONFIGURED",
    transport: null,
    egnPermitted: false,
  }),
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

describe("PreopForm invalid submit", () => {
  /**
   * heightCm is clinically *present* (a finite number, so the readiness check
   * `missingPreopFields` -- which only asks "is this filled in" -- sees
   * nothing wrong), but 9999 cm is nowhere near the shared clinical range
   * (preopSchema's `preopNumber("heightCm")`, core's CLINICAL_NUMBER_RULES:
   * 20-280). The form used to retry through its own readiness check on the
   * raw value regardless of what react-hook-form's zod resolver said, so this
   * exact case reached onSubmit. It must not.
   */
  it("does not submit a value the shared clinical range already rejects", async () => {
    const submit = vi.fn()
    const autosave = vi.fn()
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PreopForm
          defaultValues={{
            // Appliance-only: a case is opened against the hospital record number,
            // so the form refuses to submit without one.
            patientId: "IZ-12345",
            clinicalMode: "ADULT",
            ageYears: 45,
            sex: "MALE",
            heightCm: 9999,
            weightKg: 80,
            diagnoses: [{ label: "Test diagnosis" }],
            procedures: [{ label: "Test procedure" }],
            bpSystolic: 120,
            bpDiastolic: 80,
            heartRate: 70,
            respiratoryRate: 14,
            mallampati: "I",
            asaScore: "II",
          }}
          onSubmit={submit}
          onAutoSave={autosave}
        />
      </NextIntlClientProvider>,
    )

    const form = container.querySelector("form") as HTMLFormElement
    await act(async () => { fireEvent.submit(form) })

    expect(submit).not.toHaveBeenCalled()
  })

  it("still submits once the out-of-range value is corrected", async () => {
    const submit = vi.fn()
    const autosave = vi.fn()
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PreopForm
          defaultValues={{
            // Appliance-only: a case is opened against the hospital record number,
            // so the form refuses to submit without one.
            patientId: "IZ-12345",
            clinicalMode: "ADULT",
            ageYears: 45,
            sex: "MALE",
            heightCm: 175,
            weightKg: 80,
            diagnoses: [{ label: "Test diagnosis" }],
            procedures: [{ label: "Test procedure" }],
            bpSystolic: 120,
            bpDiastolic: 80,
            heartRate: 70,
            respiratoryRate: 14,
            mallampati: "I",
            asaScore: "II",
          }}
          onSubmit={submit}
          onAutoSave={autosave}
        />
      </NextIntlClientProvider>,
    )

    const form = container.querySelector("form") as HTMLFormElement
    await act(async () => { fireEvent.submit(form) })

    expect(submit).toHaveBeenCalledTimes(1)
  })
})
