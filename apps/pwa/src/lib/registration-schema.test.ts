import { describe, expect, it } from "vitest"
import { STRINGS } from "@/i18n/strings"
import { createRegistrationSchema } from "./registration-schema"

const translate = (language: "bg" | "en") =>
  (key: keyof typeof STRINGS.en) => STRINGS[language][key]

const valid = {
  firstName: "Ana",
  lastName: "Ivanova",
  title: "Dr.",
  email: "ana@example.org",
  country: "Bulgaria",
  institutionId: "institution-1",
  password: "Secure1!",
  confirmPassword: "Secure1!",
  acceptedTerms: true,
}

describe("public-demo registration validation", () => {
  it.each(["bg", "en"] as const)("accepts a complete %s form", language => {
    expect(createRegistrationSchema(translate(language)).safeParse(valid).success).toBe(true)
  })

  it.each(["bg", "en"] as const)("requires institution in %s", language => {
    const result = createRegistrationSchema(translate(language)).safeParse({
      ...valid,
      institutionId: "",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ["institutionId"],
        message: STRINGS[language].institutionRequired,
      }))
    }
  })

  it("keeps password mismatch and legal acceptance explicit", () => {
    const result = createRegistrationSchema(translate("bg")).safeParse({
      ...valid,
      confirmPassword: "Different1!",
      acceptedTerms: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.path[0])).toEqual(
        expect.arrayContaining(["confirmPassword", "acceptedTerms"]),
      )
    }
  })
})

