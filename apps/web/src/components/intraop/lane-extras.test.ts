import { describe, expect, it } from "vitest"
import { laneDuration, totalColumn } from "./lane-extras"

describe("lane totals (10.8.0)", () => {
  it("writes a duration the way the record does", () => {
    expect(laneDuration(0, 5)).toBe("30 min")
    expect(laneDuration(0, 11)).toBe("1 h")
    expect(laneDuration(2, 16)).toBe("1 h 15 min")
  })

  it("puts the total after a stopped bar's end, and after now on a running one", () => {
    expect(totalColumn({ endCol: 9, stopped: true }, 20)).toBe(10)
    expect(totalColumn({ endCol: 30 }, 14)).toBe(15)
    expect(totalColumn({ endCol: 30 }, null)).toBe(31)
  })
})
