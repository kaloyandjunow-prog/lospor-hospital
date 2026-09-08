import { describe, expect, it } from "vitest"
import { canProgressAfterSave } from "./save-progression"

const existingCase = { caseExistedBeforeSave: true }
const brandNewCase = { caseExistedBeforeSave: false }

describe("deciding whether a screen may advance after a save", () => {
  it("advances on a confirmed save, whether or not the case existed before", () => {
    expect(canProgressAfterSave("saved", existingCase)).toEqual({ canProgress: true })
    expect(canProgressAfterSave("saved", brandNewCase)).toEqual({ canProgress: true })
  })

  it("never advances on a permanent server refusal", () => {
    expect(canProgressAfterSave("blocked", existingCase))
      .toEqual({ canProgress: false, reason: "blocked" })
  })

  it("never advances while a genuine conflict is unresolved", () => {
    expect(canProgressAfterSave("conflict", existingCase))
      .toEqual({ canProgress: false, reason: "conflict" })
  })

  it("never advances on an outright failure", () => {
    expect(canProgressAfterSave("failed", existingCase))
      .toEqual({ canProgress: false, reason: "failed" })
    expect(canProgressAfterSave("failed", brandNewCase))
      .toEqual({ canProgress: false, reason: "failed" })
  })

  it("treats nothing-to-save as safe to advance", () => {
    expect(canProgressAfterSave("empty", existingCase)).toEqual({ canProgress: true })
  })

  /**
   * This is the actual bug: web moved to the next screen as soon as it called
   * save, without waiting to learn the case was never created. A queued write
   * is durable and will reach the server eventually, but before a case
   * exists there is nothing durable to advance into -- no id another screen,
   * another device, or a reopened session could find.
   */
  describe("a queued save is only safe to advance past once the case already existed", () => {
    it("advances when the case already existed", () => {
      expect(canProgressAfterSave("queued", existingCase)).toEqual({ canProgress: true })
    })

    it("refuses to advance when this save was the case's creation", () => {
      expect(canProgressAfterSave("queued", brandNewCase))
        .toEqual({ canProgress: false, reason: "no-case-yet" })
    })
  })
})
