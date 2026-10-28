// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import bgMessages from "../../messages/bg.json"
import enMessages from "../../messages/en.json"
import { EquipmentSuggestions } from "./EquipmentSuggestions"

function renderSuggestions(
  props: React.ComponentProps<typeof EquipmentSuggestions>,
  locale: "bg" | "en" = "en",
) {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "bg" ? bgMessages : enMessages}
    >
      <EquipmentSuggestions {...props} />
    </NextIntlClientProvider>,
  )
}

describe("EquipmentSuggestions", () => {
  it("renders fixed pediatric guidance without a ruleset payload", () => {
    renderSuggestions(
      {
        clinicalMode: "PEDIATRIC",
        ageValue: 5,
        ageUnit: "YEARS",
        ageYears: 5,
        weightKg: 20,
        heightCm: 110,
        sex: "MALE",
      },
    )

    expect(screen.getByText("Suggested equipment & sizes")).toBeTruthy()
    expect(screen.getByText("ETT size")).toBeTruthy()
    expect(screen.getByText(/Starting estimate/)).toBeTruthy()
    expect(screen.getByText(/McLaren IBW/)).toBeTruthy()
    expect(screen.queryByText(/institution preset/i)).toBeNull()
  })

  it("keeps the established adult equipment rows", () => {
    renderSuggestions(
      {
        clinicalMode: "ADULT",
        ageYears: 45,
        weightKg: 80,
        heightCm: 180,
        sex: "MALE",
      },
    )

    expect(screen.getByText("ETT size")).toBeTruthy()
    expect(screen.getByText("Tidal volume")).toBeTruthy()
    expect(screen.getByText("Urinary catheter")).toBeTruthy()
    expect(screen.getByText("Defibrillator")).toBeTruthy()
  })

  it("renders pediatric guidance in Bulgarian", () => {
    renderSuggestions(
      {
        clinicalMode: "PEDIATRIC",
        ageValue: 5,
        ageUnit: "YEARS",
        ageYears: 5,
        weightKg: 20,
        heightCm: 110,
        sex: "FEMALE",
      },
      "bg",
    )

    expect(screen.getByText("Предложено оборудване и размери")).toBeTruthy()
    expect(screen.getByText("Размер на ETT")).toBeTruthy()
    expect(screen.getByText("Дълбочина на ETT при устната комисура")).toBeTruthy()
    expect(screen.getByText("Поддържаща скорост на инфузия на течности")).toBeTruthy()
    expect(screen.getAllByText(/с маншет/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/маншон/)).toBeNull()
    expect(screen.getAllByText(/Начална оценка/).length).toBeGreaterThan(0)
    expect(screen.queryByText("Suggested equipment & sizes")).toBeNull()
  })
})

describe("the Broselow colour in the equipment suggestions", () => {
  const child = { clinicalMode: "PEDIATRIC" as const, ageValue: 6, ageUnit: "YEARS" as const, ageYears: 6, weightKg: 20, heightCm: 112, sex: "MALE" }

  it("shows a child's tape colour at the top, in English", () => {
    renderSuggestions(child)
    const badge = screen.getByTestId("broselow-badge")
    expect(badge.dataset.zone).toBe("BLUE")
    expect(badge.textContent).toContain("Broselow Blue")
    expect(badge.textContent).toContain("by height")
  })

  it("names the colour in Bulgarian", () => {
    renderSuggestions(child, "bg")
    expect(screen.getByTestId("broselow-badge").textContent).toContain("Син")
    expect(screen.getByTestId("broselow-badge").textContent).toContain("по ръст")
  })

  it("shows no colour for an adult", () => {
    renderSuggestions({ clinicalMode: "ADULT", ageYears: 40, weightKg: 70, heightCm: 175, sex: "MALE" })
    expect(screen.queryByTestId("broselow-badge")).toBeNull()
  })
})
