import { describe, expect, it } from "vitest"
import { SUGGESTION_CARDS } from "@lospor/core/intraop-suggestions"
import { cardPreview, isPreviewPatient } from "./card-preview"

describe("the treatment card preview (10.3.0)", () => {
  it("shows the card as the screen resolves it, with the doses worked out for the sample patient", () => {
    const adult = cardPreview("Hypotension", "adult")!
    expect(adult).toMatchObject({ complication: "Hypotension", kind: "card", patient: { key: "adult" } })
    expect(adult.rows.length).toBeGreaterThan(0)
    const ephedrine = adult.rows.find(row => row.titleEn.toLowerCase().includes("ephedrine"))!
    expect(ephedrine.dose?.en).toMatch(/^\d/)

    // A child's dose is worked out on the child's weight, so it is not the adult's.
    const child = cardPreview("Hypotension", "child")!
    const childEphedrine = child.rows.find(row => row.titleEn.toLowerCase().includes("ephedrine"))
    expect(childEphedrine?.dose?.en).not.toBe(ephedrine.dose?.en)
  })

  it("names the complication in Bulgarian and gives both languages for every row", () => {
    const view = cardPreview("Hypotension", "adult")!
    expect(view.complicationBg).toBeTruthy()
    for (const row of view.rows) {
      expect(row.titleEn).toBeTruthy()
      expect(row.titleBg).toBeTruthy()
    }
  })

  it("knows no card for a made-up complication, and only the three sample patients", () => {
    expect(cardPreview("Not a complication", "adult")).toBeNull()
    expect(isPreviewPatient("adult")).toBe(true)
    expect(isPreviewPatient("constructor")).toBe(false)
    expect(isPreviewPatient("toString")).toBe(false)
  })

  it("resolves every card in the catalogue for every sample patient without failing", () => {
    for (const card of SUGGESTION_CARDS) {
      for (const patient of ["adult", "child", "infant"] as const) {
        expect(() => cardPreview(card.complications[0]!, patient), `${card.complications[0]} / ${patient}`).not.toThrow()
      }
    }
  })

  it("carries no case, no clinician and no time of its own", () => {
    expect(JSON.stringify(cardPreview("Hypotension", "adult"))).not.toMatch(/preview|20\d\d-\d\d-\d\d/)
  })
})
