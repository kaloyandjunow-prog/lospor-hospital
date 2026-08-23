import { describe, expect, it } from "vitest"
import { isValidLoginUsername } from "./username-login"

describe("Hospital login username", () => {
  it.each(["Ivan.Petrov_2", "a-b", "Z99", "Mixed.CASE"])("accepts %s without changing case", value => {
    expect(isValidLoginUsername(value)).toBe(true)
  })

  it.each(["ab", "  Ivan", "Ivan Petrov", "ivan@example", "ivan/petrov", "ivan\\petrov", "Иван", "Ａbc", "a\u0000b"])("rejects %j", value => {
    expect(isValidLoginUsername(value)).toBe(false)
  })
})
