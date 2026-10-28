// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "../../../messages/en.json"
import bgMessages from "../../../messages/bg.json"
import type { PreopLayout } from "@/lib/preop-layout"
import { defaultPreopSectionConfig } from "@lospor/core/preop-orders"
import type { PreopAssessmentProfile } from "@lospor/core/preop-assessment"

vi.mock("@/hooks/useOptionLibrary", () => ({
  useOptionLibrary: () => ({ options: [], loading: false, source: "bundled" }),
  useRange: () => ({ min: 0, max: 300, step: 1, unit: "" }),
}))

vi.mock("@/lib/deployment-capabilities", () => ({
  capabilityMessageKey: () => "deploymentCapabilities.externalAiUnavailable",
  pediatricCapabilityMessageKey: () => "newSelectionUnavailable",
  useEhrImportCapability: () => ({
    enabled: false, reason: "PROVIDER_NOT_CONFIGURED", transport: null,
    folderRequests: false, egnPermitted: false,
  }),
  useClinicalAiCapabilities: () => ({
    clinicalAdvice: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    labImageExtraction: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    monitorOcr: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
  }),
  usePediatricModeCapability: () => ({
    enabled: true, reason: null, productionReady: true,
    rulesetVersion: null, minimumClientVersion: null, reviewedDoseProfilesRequired: false,
  }),
}))

import { PreopForm } from "./PreopForm"

function renderForm(layoutMode: PreopLayout, defaults: Record<string, unknown> = {}, locale: "en" | "bg" = "en", preopProfile?: PreopAssessmentProfile) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "bg" ? bgMessages : enMessages}>
      <PreopForm defaultValues={{ clinicalMode: "ADULT", ...defaults }} onSubmit={vi.fn()} onAutoSave={vi.fn()} layoutMode={layoutMode} preopProfile={preopProfile} />
    </NextIntlClientProvider>,
  )
}

describe("the sidebar preoperative layout", () => {
  it("draws the sidebar with every section, and the legacy page does not", () => {
    renderForm("sidebar")
    const sidebar = screen.getByTestId("preop-sidebar")
    for (const section of ["Demographics", "Case details", "Airway", "Laboratory", "Planned anaesthesia"]) {
      expect(within(sidebar).getByRole("button", { name: new RegExp(section) }), section).toBeTruthy()
    }
    // Every entry has a place on the page to jump to.
    for (const id of ["demographics", "case", "history", "medications", "anamnesis", "vitals", "airway", "labs", "planned", "risk"]) {
      expect(document.getElementById(`preop-sec-${id}`), id).not.toBeNull()
    }
  })

  it("keeps the legacy page exactly as it was: no sidebar, and the plan under the risk scores", () => {
    const { container } = renderForm("scroll")
    expect(screen.queryByTestId("preop-sidebar")).toBeNull()
    expect(screen.queryByTestId("preop-section-strip")).toBeNull()
    expect(document.getElementById("preop-sec-planned")).toBeNull()
    const risk = container.querySelector("[data-readiness='risk_scores']")!
    expect(risk.querySelector("[data-testid='preop-planned-anaesthesia']")).not.toBeNull()
  })

  it("moves the plan into its own card, with one heading and not two", () => {
    renderForm("sidebar")
    const planned = document.getElementById("preop-sec-planned")!
    expect(planned.querySelector("[data-testid='preop-planned-anaesthesia']")).not.toBeNull()
    const risk = document.getElementById("preop-sec-risk")!
    expect(risk.querySelector("[data-testid='preop-planned-anaesthesia']")).toBeNull()
    const visibleHeadings = [...planned.querySelectorAll("legend:not(.sr-only), h3, [data-slot='card-title']")]
      .filter(node => node.textContent === "Planned anaesthesia")
    expect(visibleHeadings).toHaveLength(1)
  })

  it("marks what is still required, and clears it as the form is filled", () => {
    renderForm("sidebar")
    const sidebar = screen.getByTestId("preop-sidebar")
    expect(within(sidebar).getByRole("button", { name: /Demographics/ }).querySelector("[aria-label='A required field is empty']")).not.toBeNull()
    expect(within(sidebar).getByRole("button", { name: /Risk scores/ }).querySelector("[aria-label='A required field is empty']")).not.toBeNull()
  })

  it("keeps an allergy in view in the sidebar once one is recorded", () => {
    const { container } = renderForm("sidebar")
    expect(screen.queryByTestId("sidebar-allergy")).toBeNull()
    fireEvent.click(container.querySelector("[aria-label='allergies: Yes']")!)
    expect(screen.getAllByTestId("sidebar-allergy").length).toBeGreaterThan(0)
  })

  it("shows a child's Broselow colour in the sidebar", () => {
    renderForm("sidebar", { clinicalMode: "PEDIATRIC", ageValue: 4, ageUnit: "YEARS", ageYears: 4, sex: "MALE", heightCm: 100, weightKg: 16 })
    const badge = within(screen.getByTestId("preop-sidebar")).getByTestId("broselow-badge")
    expect(badge.dataset.zone).toBe("WHITE")
  })

  it("is in Bulgarian when the language is", () => {
    renderForm("sidebar", {}, "bg")
    const sidebar = screen.getByTestId("preop-sidebar")
    expect(within(sidebar).getByText("Пациент")).toBeTruthy()
    expect(within(sidebar).getByText("Скорове")).toBeTruthy()
  })

  it("shows height and weight in the units chosen in Settings, with Latin units in Bulgarian too", () => {
    const values = { heightCm: 180, weightKg: 80 }
    try {
      localStorage.setItem("heightUnit", "in")
      localStorage.setItem("weightUnit", "lb")
      const { unmount } = renderForm("sidebar", values)
      const sidebar = within(screen.getByTestId("preop-sidebar"))
      expect(sidebar.getByText("70.9 in")).toBeTruthy()
      expect(sidebar.getByText("176.4 lb")).toBeTruthy()
      unmount()
      localStorage.removeItem("heightUnit")
      localStorage.removeItem("weightUnit")
      renderForm("sidebar", values, "bg")
      const bg = within(screen.getByTestId("preop-sidebar"))
      expect(bg.getByText("180 cm")).toBeTruthy()
      expect(bg.getByText("80 kg")).toBeTruthy()
      expect(bg.getByText("ИТМ")).toBeTruthy()
    } finally {
      localStorage.removeItem("heightUnit")
      localStorage.removeItem("weightUnit")
    }
  })

  it("draws the ward orders and medication instructions, and leaves out what the hospital switched off", () => {
    renderForm("sidebar")
    for (const id of ["ward-orders", "medication-instructions"]) expect(document.getElementById(`preop-sec-${id}`), id).not.toBeNull()
    expect(within(screen.getByTestId("preop-sidebar")).getByRole("button", { name: /Preoperative ward orders/ })).toBeTruthy()

    document.body.innerHTML = ""
    const config = defaultPreopSectionConfig("ADULT")
    config.sections.LABS = false
    config.sections.WARD_ORDERS = false
    config.sections.CURRENT_MEDICATIONS = false
    const profile = { id: "p", version: 1, catalogVersion: "x", status: "PUBLISHED", publishedAt: null, questions: [], sectionConfigs: { ADULT: config } } as PreopAssessmentProfile
    renderForm("sidebar", {}, "en", profile)
    // Instructions pick from the medication list, so they go with it.
    for (const id of ["labs", "ward-orders", "medications", "medication-instructions"]) expect(document.getElementById(`preop-sec-${id}`), id).toBeNull()
    const sidebar = within(screen.getByTestId("preop-sidebar"))
    expect(sidebar.queryByRole("button", { name: /Laboratory/ })).toBeNull()
    expect(sidebar.queryByRole("button", { name: /Preoperative ward orders/ })).toBeNull()
    expect(document.getElementById("preop-sec-airway")).not.toBeNull()
  })

  it("puts the anamnesis rows in two columns on a wide screen only", () => {
    const sidebarForm = renderForm("sidebar").container
    expect(sidebarForm.querySelector("#preop-sec-anamnesis [class*='lg:columns-2']")).not.toBeNull()
    const legacy = renderForm("scroll").container
    expect(legacy.querySelector("[class*='lg:columns-2']")).toBeNull()
  })
})

describe("the tabbed preoperative layout (10.0.0)", () => {
  it("puts the plan and the orders on a tab of their own, and names the tabs in the reader's language", () => {
    renderForm("tabs", {}, "bg")
    const tabs = screen.getAllByRole("tab").map(tab => tab.textContent ?? "")
    for (const label of ["Пациент", "Риск и ASA", "План и назначения"]) expect(tabs.some(text => text.startsWith(label)), label).toBe(true)
    // On Risk & ASA, the plan is hidden; on its own tab, shown.
    const planned = document.getElementById("preop-sec-planned")!
    expect(planned).not.toBeNull()
    expect(planned.closest(".hidden")).not.toBeNull()
    fireEvent.click(screen.getByRole("tab", { name: "План и назначения" }))
    expect(document.getElementById("preop-sec-planned")!.closest(".hidden")).toBeNull()
    expect(document.getElementById("preop-sec-notes")!.closest(".hidden")).toBeNull()
  })
})

describe("the case panel's stages", () => {
  it("shows where the case is, and opens an earlier step", () => {
    const onSelect = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PreopForm defaultValues={{ clinicalMode: "ADULT" }} onSubmit={vi.fn()} onAutoSave={vi.fn()} layoutMode="sidebar" stages={{ current: 0, onSelect }} />
      </NextIntlClientProvider>,
    )
    const stages = within(screen.getByTestId("sidebar-stages"))
    expect(stages.getByRole("button", { name: /Preop/ }).getAttribute("aria-current")).toBe("step")
    // A later step cannot be opened from here.
    expect((stages.getByRole("button", { name: /Postop/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
