import { describe, expect, it } from "vitest"
import { auditHistoryShape } from "./control-plane.js"
import { historyFixture } from "./history.fixture.js"
import { historyQueryOf, renderHistoryPage } from "./history-ui.js"

describe("the change history (10.3.0)", () => {
  it("accepts only a bounded, well-formed page of rows", () => {
    expect(auditHistoryShape(historyFixture())).toBe(true)
    expect(auditHistoryShape(null)).toBe(false)
    expect(auditHistoryShape({ ...historyFixture(), pageSize: 0 })).toBe(false)
    expect(auditHistoryShape({ ...historyFixture(), rows: [{ id: 1 }] })).toBe(false)
  })

  it("reads the query as plain codes and a bounded page, whatever was sent", () => {
    const get = (values: Record<string, string>) => (name: string) => values[name]
    expect(historyQueryOf(get({ page: "2", category: "CENTRAL", action: "HOSPITAL_NAME_UPDATE" }))).toEqual({ page: 2, category: "CENTRAL", action: "HOSPITAL_NAME_UPDATE" })
    expect(historyQueryOf(get({ page: "-4", category: "central", action: "x\"><script>" }))).toEqual({ page: 0, category: "", action: "" })
    expect(historyQueryOf(get({ page: "99999999" })).page).toBe(0)
    expect(historyQueryOf(() => undefined)).toEqual({ page: 0, category: "", action: "" })
  })

  it("lists when, what, who and the area, in the language of the page, escaped", () => {
    const html = renderHistoryPage(historyFixture(), { page: 1, category: "", action: "" }, "en")
    expect(html).toContain('data-testid="history-table"')
    expect(html).toContain("Hospital name on the record changed")
    expect(html).toContain("UTC")
    expect(html).toContain("Dr. &lt;b&gt;Ivan&lt;/b&gt; Petrov")
    expect(html).not.toContain("<b>Ivan</b>")
    expect(renderHistoryPage(historyFixture(), { page: 0, category: "", action: "" }, "bg")).toContain("Променено име на болницата в протокола")
  })

  it("pages with plain links that keep the filter, and offers only the actions of the chosen area", () => {
    const html = renderHistoryPage(historyFixture(), { page: 1, category: "SECURITY", action: "" }, "en")
    expect(html).toContain('href="/status/control/history?category=SECURITY"')
    expect(html).toContain('href="/status/control/history?category=SECURITY&amp;page=2"')
    expect(html).toContain("page 2 / 3")
    expect(html).toContain('value="INTRAOP_AUTOMATION_UPDATE"')
    expect(html).not.toContain('value="ACCOUNT_PROVISION"')
  })

  it("says so when nothing matches, or when the API does not offer it", () => {
    expect(renderHistoryPage(historyFixture({ rows: [], total: 0, page: 0 }), { page: 0, category: "", action: "" }, "en")).toContain('data-testid="history-empty"')
    expect(renderHistoryPage(null, { page: 0, category: "", action: "" }, "en")).toContain("does not report")
  })
})
