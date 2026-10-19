import { describe, expect, it } from "vitest"
import { localizeServerMessage, SERVER_MESSAGES_BG } from "./server-messages"

describe("server messages in Bulgarian", () => {
  it("translates a known message and leaves English readers alone", () => {
    expect(localizeServerMessage("Case is finalised", "bg")).toBe("Случаят е приключен")
    expect(localizeServerMessage("Case is finalised", "bg-BG")).toBe("Случаят е приключен")
    expect(localizeServerMessage("Case is finalised", "en")).toBe("Case is finalised")
  })

  it("keeps the number in messages that carry one", () => {
    expect(localizeServerMessage("Request failed (502).", "bg")).toBe("Заявката не успя (502).")
    expect(localizeServerMessage("Save failed (HTTP 409)", "bg")).toBe("Записът не успя (HTTP 409)")
    expect(localizeServerMessage("Export contains 12 matching cases; narrow the export before retrying", "bg"))
      .toBe("Експортът съдържа 12 случая; стеснете го и опитайте отново")
  })

  it("shows an unknown message as sent", () => {
    expect(localizeServerMessage("Something new", "bg")).toBe("Something new")
  })

  it("has Cyrillic in every Bulgarian message", () => {
    for (const [english, bulgarian] of Object.entries(SERVER_MESSAGES_BG)) {
      expect(bulgarian, english).toMatch(/\p{Script=Cyrillic}/u)
    }
  })
})
