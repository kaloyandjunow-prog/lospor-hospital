import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AsaAgreementPanel } from "./asa-agreement-panel"

afterEach(cleanup)

describe("the ASA agreement panel", () => {
  it("shows each rule with its share of agreement and departures", () => {
    render(<AsaAgreementPanel locale="en" rows={[
      { reasonCode: "copd", suggested: "III", cases: 20, agreed: 6, choseLower: 9, choseHigher: 5, suppressed: false },
      { reasonCode: "asthma", suggested: "II", cases: null, agreed: null, choseLower: null, choseHigher: null, suppressed: true },
    ]} />)
    const copd = screen.getByText("COPD").closest("tr")!
    expect(copd.textContent).toContain("ASA III")
    expect(copd.textContent).toContain("30%")
    expect(copd.textContent).toContain("45%")
    expect(copd.textContent).toContain("25%")
    expect(screen.getByText("Asthma").closest("tr")!.textContent).toContain("<5")
  })

  it("says so when there is nothing to show yet", () => {
    render(<AsaAgreementPanel locale="bg" rows={[]} />)
    expect(screen.getByText("Все още няма финализирани случаи с предложение за ASA.")).toBeTruthy()
  })
})

describe("the ASA agreement panel in Bulgarian", () => {
  it("names each rule in Bulgarian", () => {
    render(<AsaAgreementPanel locale="bg" rows={[
      { reasonCode: "copd", suggested: "III", cases: 20, agreed: 6, choseLower: 9, choseHigher: 5, suppressed: false },
    ]} />)
    expect(screen.getByText("ХОББ")).toBeTruthy()
  })
})
