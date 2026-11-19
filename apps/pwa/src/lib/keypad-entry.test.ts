import { describe, expect, it } from "vitest"
import { pressKeypadKey } from "./keypad-entry"

describe("the in-app numpad", () => {
  const fresh = { precision: 1, replace: true }
  const typing = { precision: 1, replace: false }

  it("replaces the shown value with the first digit typed", () => {
    expect(pressKeypadKey("120", "7", fresh)).toBe("7")
    expect(pressKeypadKey("1.5", "2", fresh)).toBe("2")
  })

  it("then adds the digits that follow", () => {
    expect(pressKeypadKey("7", "5", typing)).toBe("75")
    expect(pressKeypadKey("1", ".", typing)).toBe("1.")
    expect(pressKeypadKey("1.", "2", typing)).toBe("1.2")
  })

  it("takes a decimal point first, over the shown value, when decimals are allowed", () => {
    expect(pressKeypadKey("120", ".", fresh)).toBe(".")
    expect(pressKeypadKey(".", "5", typing)).toBe(".5")
  })

  it("ignores a point where there are no decimals", () => {
    expect(pressKeypadKey("120", ".", { precision: 0, replace: true })).toBe("120")
  })

  it("ignores a second point", () => {
    expect(pressKeypadKey("1.5", ".", typing)).toBe("1.5")
  })

  it("does not keep a leading zero", () => {
    expect(pressKeypadKey("0", "5", typing)).toBe("5")
    expect(pressKeypadKey("120", "0", fresh)).toBe("0")
  })

  it("back removes the last character of the shown value, clear empties it", () => {
    expect(pressKeypadKey("120", "back", fresh)).toBe("12")
    expect(pressKeypadKey("120", "clear", fresh)).toBe("")
  })
})
