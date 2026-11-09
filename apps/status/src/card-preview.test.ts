import { describe, expect, it } from "vitest"
import { cardPreviewFixture } from "./card-preview.fixture.js"
import { cardQueryOf, renderCardPreviewPage } from "./card-preview-ui.js"
import { cardPreviewShape } from "./control-plane.js"
import { intraopFixture } from "./intraop.fixture.js"

const view = () => {
  const base = intraopFixture()
  // The fixture's catalogue has no cards of its own: add the one being previewed.
  return { ...base, automations: [...base.automations, { id: "card:Hypotension", group: "treatmentSuggestions", labelEn: "Hypotension", labelBg: "Хипотенсия", detailEn: "", detailBg: "" }] }
}

describe("the card preview (10.3.0)", () => {
  it("accepts only a well-formed preview", () => {
    expect(cardPreviewShape(cardPreviewFixture())).toBe(true)
    expect(cardPreviewShape(cardPreviewFixture({ preview: null }))).toBe(true)
    expect(cardPreviewShape(null)).toBe(false)
    expect(cardPreviewShape({ patients: [], preview: { complication: "x" } })).toBe(false)
  })

  it("reads the query as a plain complication name and a plain patient word", () => {
    const get = (values: Record<string, string>) => (name: string) => values[name]
    expect(cardQueryOf(get({ complication: "Hypotension", patient: "child" }))).toEqual({ complication: "Hypotension", patient: "child" })
    expect(cardQueryOf(get({ patient: "../x" }))).toEqual({ complication: "", patient: "adult" })
    expect(cardQueryOf(get({ complication: "x".repeat(500) })).complication).toHaveLength(120)
  })

  it("shows the card with its question, rows and doses, in both languages, escaped", () => {
    const en = renderCardPreviewPage(cardPreviewFixture(), view(), { complication: "Hypotension", patient: "adult" }, "en")
    expect(en).toContain('data-testid="card-preview"')
    expect(en).toContain("Treat now?")
    expect(en).toContain("10 mg")
    expect(en).toContain("Atropine &lt;b&gt;x&lt;/b&gt;")
    expect(en).not.toContain("<b>x</b>")
    expect(en).toContain("step 1 / 3")
    expect(en).toContain('href="/status/control/intraop/cards"')
    const bg = renderCardPreviewPage(cardPreviewFixture(), view(), { complication: "Hypotension", patient: "adult" }, "bg")
    expect(bg).toContain("Лечение сега?")
    expect(bg).toContain("Ефедрин")
  })

  it("says whether the card is on for this hospital", () => {
    expect(renderCardPreviewPage(cardPreviewFixture(), view(), { complication: "Hypotension", patient: "adult" }, "en")).not.toContain('data-testid="card-preview-off"')
    const switchedOff = view()
    switchedOff.config = { ...switchedOff.config, disabled: ["card:Hypotension"] }
    expect(renderCardPreviewPage(cardPreviewFixture(), switchedOff, { complication: "Hypotension", patient: "adult" }, "en")).toContain('data-testid="card-preview-off"')
  })

  it("asks for a choice before one is made, and says so when a card has no preview or the API lacks it", () => {
    expect(renderCardPreviewPage(cardPreviewFixture({ preview: null }), view(), { complication: "", patient: "adult" }, "en")).toContain('data-testid="card-preview-none"')
    expect(renderCardPreviewPage(cardPreviewFixture({ preview: null }), view(), { complication: "Nothing", patient: "adult" }, "en")).toContain('data-testid="card-preview-missing"')
    expect(renderCardPreviewPage(null, view(), { complication: "", patient: "adult" }, "en")).toContain("does not offer")
  })
})
