import { describe, expect, it } from "vitest"
import { acceptanceFixture } from "./acceptance.fixture.js"
import { renderAcceptancePage, sparkline, trendLines, TREND_MIN_ANSWERS } from "./acceptance-ui.js"
import { acceptanceTrendShape } from "./control-plane.js"
import { intraopFixture } from "./intraop.fixture.js"

describe("the acceptance trend (10.3.0)", () => {
  it("accepts only a well-formed, bounded series of counts", () => {
    expect(acceptanceTrendShape(acceptanceFixture())).toBe(true)
    expect(acceptanceTrendShape(null)).toBe(false)
    expect(acceptanceTrendShape({ ...acceptanceFixture(), cases: [1] })).toBe(false)
    expect(acceptanceTrendShape({ ...acceptanceFixture(), months: acceptanceFixture().months.map(() => "soon") })).toBe(false)
    expect(acceptanceTrendShape({ ...acceptanceFixture(), byId: { x: [{ accepted: -1, dismissed: 0 }] } })).toBe(false)
  })

  it("puts the rarely taken first, leaves out lines with no answers, and measures the change", () => {
    const lines = trendLines(acceptanceFixture())
    expect(lines.map(line => line.id)).toEqual(["reverse:adenosine", "card:Hypotension"])
    expect(lines[0]).toMatchObject({ noisy: true, answered: 52, accepted: 1 })
    // The card was taken 8 in 10 early and 2 in 10 lately: the last three months against the three before.
    const card = lines[1]!
    expect(card.noisy).toBe(false)
    expect(card.change).toBeLessThan(-10)
  })

  it("leaves a month with too few answers out of the curve", () => {
    expect(TREND_MIN_ANSWERS).toBe(3)
    const svg = sparkline([0.5, null, 0.5, 0.6, 0.7])
    expect(svg.match(/<circle/g)).toHaveLength(4)
    expect(svg.match(/<polyline/g)).toHaveLength(1)
  })

  it("renders the table in both languages, the cases per month, and no case or person", () => {
    const view = intraopFixture()
    const en = renderAcceptancePage(acceptanceFixture(), view, "en")
    expect(en).toContain('data-testid="trend-table"')
    expect(en).toContain("rarely taken")
    expect(en).toContain('data-testid="trend-cases"')
    expect(en).toContain('href="/status/control/intraop/acceptance"')
    expect(renderAcceptancePage(acceptanceFixture(), view, "bg")).toContain("рядко се приема")
    expect(en).toContain("1 lines had no answers.")
  })

  it("says so when the API does not offer it, or nothing was answered", () => {
    expect(renderAcceptancePage(null, intraopFixture(), "en")).toContain("does not report")
    const empty = { ...acceptanceFixture(), byId: {} }
    expect(renderAcceptancePage(empty, intraopFixture(), "en")).toContain('data-testid="trend-empty"')
  })
})
