import { describe, expect, it } from "vitest"
import { localizedPreopValidationMessage } from "./preop-validation-messages"

const translate = (key: string) => `bg:${key}`

describe("localized preoperative validation messages", () => {
  it("maps stable schema codes through the active clinical locale", () => {
    expect(localizedPreopValidationMessage("missing_weight", translate)).toBe(
      "bg:validationMissingWeight",
    )
  })

  it("does not display unexpected upstream validation prose", () => {
    expect(localizedPreopValidationMessage("untranslated server detail", translate)).toBe(
      "bg:validationInvalidField",
    )
  })

  it("omits an absent issue", () => {
    expect(localizedPreopValidationMessage(undefined, translate)).toBeUndefined()
  })
})
