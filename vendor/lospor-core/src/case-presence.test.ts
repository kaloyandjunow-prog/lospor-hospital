import { describe, expect, it } from "vitest"
import { casePresenceLabel } from "./case-presence"

describe("who has the case open", () => {
  it("says nothing while this screen is alone", () => {
    expect(casePresenceLabel(null, "bg")).toBe("")
    expect(casePresenceLabel({ people: [{ name: "Мария", you: true }], screens: 1 }, "bg")).toBe("")
  })

  it("lists every person, marking the reader", () => {
    const presence = { people: [{ name: "Мария Иванова", you: true }, { name: "Иван Петров", you: false }], screens: 2 }
    expect(casePresenceLabel(presence, "bg")).toBe("Случаят е отворен от: Мария Иванова (вие), Иван Петров")
    expect(casePresenceLabel(presence, "en")).toBe("Case open by: Мария Иванова (you), Иван Петров")
  })

  it("speaks up when the same person has a second screen open", () => {
    expect(casePresenceLabel({ people: [{ name: "Мария", you: true }], screens: 2 }, "en")).toBe("Case open by: Мария (you)")
  })
})
