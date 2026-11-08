import { describe, expect, it } from "vitest"
import { colToHHMM } from "./summary-timetable"

describe("column times", () => {
  it("uses the canonical column interval for wall-clock labels", () => {
    expect(colToHHMM(3, "2000-01-01T23:50:00.000Z")).toBe("00:05")
    expect(colToHHMM(3)).toBe("+15m")
  })
})
