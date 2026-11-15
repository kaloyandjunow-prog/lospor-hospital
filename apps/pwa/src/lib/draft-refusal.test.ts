import { describe, expect, it } from "vitest"
import { draftRefusalFrom, draftRefusalText } from "./draft-refusal"

describe("why the server refused a draft", () => {
  it("keeps only refusals no resend can get past", () => {
    expect(draftRefusalFrom(409, { code: "PEDIATRIC_MODE_REQUIRED" })).toMatchObject({ status: 409, code: "PEDIATRIC_MODE_REQUIRED" })
    expect(draftRefusalFrom(400, { error: "PII_BLOCKED", code: "PII_BLOCKED" })).toMatchObject({ code: "PII_BLOCKED" })
    expect(draftRefusalFrom(503, { error: "PEDIATRIC_MODE_DISABLED" })).toMatchObject({ code: "PEDIATRIC_MODE_DISABLED" })
    for (const status of [401, 408, 426, 429, 500, 503]) expect(draftRefusalFrom(status, {})).toBeNull()
  })

  it("names the reason, and falls back to a plain refusal", () => {
    expect(draftRefusalText({ status: 400, code: "PII_BLOCKED" }, "bg")).toContain("лични данни")
    expect(draftRefusalText({ status: 409, code: "ADULT_MODE_REQUIRED" }, "en")).toContain("adult mode")
    // A sentence such as "Invalid request" is not a code and reads as the plain refusal.
    expect(draftRefusalText({ status: 400, code: draftRefusalFrom(400, { error: "Invalid request" })!.code }, "bg"))
      .toBe("Сървърът не прие черновата. Отворете я, за да я проверите.")
  })
})
