// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { useForm } from "react-hook-form"
import { describe, expect, it } from "vitest"
import bgMessages from "../../../messages/bg.json"
import enMessages from "../../../messages/en.json"
import type { PediatricModeCapability } from "@/lib/deployment-capabilities"
import type { PreopData } from "./preopSchema"
import { ClinicalModeAgeFields } from "./PediatricPreopSections"

const enabled: PediatricModeCapability = {
  enabled: true,
  reason: "ENABLED",
  productionReady: true,
  rulesetVersion: "2026.08.04-release.1",
  minimumClientVersion: "8.0.0",
  reviewedDoseProfilesRequired: true,
}

const disabled: PediatricModeCapability = {
  ...enabled,
  enabled: false,
  reason: "DISABLED_BY_DEPLOYMENT",
}

function Harness({
  capability,
  mode = "ADULT",
  existingPediatricRecord = false,
}: {
  capability: PediatricModeCapability
  mode?: "ADULT" | "PEDIATRIC"
  existingPediatricRecord?: boolean
}) {
  const { control, setValue } = useForm<PreopData>({
    defaultValues: mode === "PEDIATRIC"
      ? {
          clinicalMode: "PEDIATRIC",
          ageValue: 5,
          ageUnit: "YEARS",
          ageYears: 5,
        }
      : { clinicalMode: "ADULT", ageYears: 35 },
  })
  return (
    <ClinicalModeAgeFields
      control={control}
      setValue={setValue}
      pediatricCapability={capability}
      existingPediatricRecord={existingPediatricRecord}
    />
  )
}

function renderHarness(
  locale: "bg" | "en",
  props: React.ComponentProps<typeof Harness>,
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "bg" ? bgMessages : enMessages}
    >
      <Harness {...props} />
    </NextIntlClientProvider>,
  )
}

describe("Pediatric preoperative capability boundary", () => {
  it("disables a new Pediatric selection and explains the deployment policy", () => {
    renderHarness("en", { capability: disabled })

    const pediatric = screen.getByRole("button", { name: "Pediatric" }) as HTMLButtonElement
    expect(pediatric.disabled).toBe(true)
    expect(pediatric.getAttribute("aria-describedby")).toBe("pediatric-mode-capability-notice")
    expect(screen.getByRole("status").textContent).toContain(
      "Pediatric mode is disabled for this installation",
    )
  })

  it("allows Pediatric selection only after the exact capability is enabled", () => {
    renderHarness("en", { capability: enabled })

    const pediatric = screen.getByRole("button", { name: "Pediatric" }) as HTMLButtonElement
    expect(pediatric.disabled).toBe(false)
    fireEvent.click(pediatric)
    expect(pediatric.getAttribute("aria-pressed")).toBe("true")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("keeps an existing Pediatric record visible and read-only", () => {
    const { container } = renderHarness("bg", {
      capability: disabled,
      mode: "PEDIATRIC",
      existingPediatricRecord: true,
    })

    expect(screen.getByRole("button", { name: "Педиатричен" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByText("Точна възраст")).toBeTruthy()
    expect(screen.queryByText(/Нов педиатричен запис/)).toBeNull()
    expect((container.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true)
  })
})
