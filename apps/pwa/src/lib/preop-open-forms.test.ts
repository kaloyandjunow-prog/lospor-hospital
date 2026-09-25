import { describe, expect, it } from "vitest"
import { isPreopFormOpen, markPreopFormOpen } from "./preop-open-forms"

describe("open preop forms", () => {
  it("counts a case open until every screen showing it has closed", () => {
    const first = markPreopFormOpen("case-1")
    const second = markPreopFormOpen("case-1")
    expect(isPreopFormOpen("case-1")).toBe(true)
    first()
    expect(isPreopFormOpen("case-1")).toBe(true)
    second()
    expect(isPreopFormOpen("case-1")).toBe(false)
    expect(isPreopFormOpen("case-2")).toBe(false)
  })
})
