// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import bgMessages from "../../../messages/bg.json"
import enMessages from "../../../messages/en.json"
import { RiskScoreCards } from "./RiskScoreCards"

function show(apfelScore: number) {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RiskScoreCards
        rcriScore={0} apfelScore={apfelScore} stopBangScore={0}
        rcriAnswered={5} apfelAnswered={3} stopBangAnswered={5}
      />
    </NextIntlClientProvider>,
  )
}

describe("the risk score cards", () => {
  // Fifth Consensus Guidelines for PONV: one Apfel factor is ~20%, medium
  // risk. The card said "low, < 10%" and coloured it green.
  it("shows one Apfel factor as medium risk, in the medium colour", () => {
    show(1)
    const label = screen.getByText("Moderate (~ 20%)")
    expect(label.className).toContain("text-amber-500")
  })

  it("keeps no Apfel factor low and green", () => {
    show(0)
    expect(screen.getByText("Low (~ 10%)").className).toContain("text-emerald-600")
  })
})

describe("the risk factor questions", () => {
  const factorKeys = Object.keys(enMessages.preop.factor)

  // These twelve were English literals in the form, so a Bulgarian clinician
  // read the RCRI, Apfel and STOP-BANG questions in English.
  it("has every factor question in both languages", () => {
    expect(factorKeys).toHaveLength(12)
    expect(Object.keys(bgMessages.preop.factor).sort()).toEqual([...factorKeys].sort())
    for (const key of factorKeys) {
      const bg = bgMessages.preop.factor[key as keyof typeof bgMessages.preop.factor]
      expect(bg).not.toBe(enMessages.preop.factor[key as keyof typeof enMessages.preop.factor])
    }
  })
})
