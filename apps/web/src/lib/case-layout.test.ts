import { describe, expect, it } from "vitest"
import { caseLayoutWrites, readCaseLayout, screenLayoutOf } from "./case-layout"

const stored = (values: Record<string, string>) => (key: string) => values[key] ?? null

describe("the case screens' layout setting (10.0.0)", () => {
  it("starts with the sidebar, as the preop form did", () => {
    expect(readCaseLayout(stored({}))).toEqual({ sidebar: true, preop: "scroll", intraop: "scroll", postop: "scroll" })
  })

  it("carries over a choice made before: the preop layout and the intraop one", () => {
    expect(readCaseLayout(stored({ preopLayout: "sidebar", layoutMode: "tabs" }))).toMatchObject({ sidebar: true, intraop: "tabs" })
    // The tabbed preop, chosen before: no sidebar, and postop follows it until it has its own.
    expect(readCaseLayout(stored({ preopLayout: "tabs" }))).toEqual({ sidebar: false, preop: "tabs", intraop: "scroll", postop: "tabs" })
    expect(readCaseLayout(stored({ preopLayout: "tabs", postopLayout: "scroll" })).postop).toBe("scroll")
  })

  it("lets the sidebar switch override every screen's own choice", () => {
    const layout = readCaseLayout(stored({ caseSidebar: "on", preopLayout: "tabs", layoutMode: "tabs" }))
    expect(screenLayoutOf(layout, "intraop")).toBe("sidebar")
    const off = readCaseLayout(stored({ caseSidebar: "off", preopLayout: "sidebar", layoutMode: "tabs" }))
    expect(screenLayoutOf(off, "preop")).toBe("scroll")
    expect(screenLayoutOf(off, "intraop")).toBe("tabs")
  })

  it("stores a change under the keys it is read from", () => {
    expect(caseLayoutWrites({ sidebar: false, postop: "tabs" })).toEqual([["caseSidebar", "off"], ["postopLayout", "tabs"]])
  })
})
