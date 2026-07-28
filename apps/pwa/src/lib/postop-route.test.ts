import { describe, expect, it } from "vitest"
import { buildPostopRoute } from "./postop-route"

describe("buildPostopRoute", () => {
  it("builds the base postop route without continued items", () => {
    expect(buildPostopRoute("case-1", [])).toBe("/(app)/cases/postop/case-1")
  })

  it("encodes continued items into a pipe-delimited query", () => {
    expect(buildPostopRoute("case-1", ["Propofol infusion", "O2 | high flow"]))
      .toBe("/(app)/cases/postop/case-1?continuedItems=Propofol%20infusion%7CO2%20%7C%20high%20flow")
  })
})
