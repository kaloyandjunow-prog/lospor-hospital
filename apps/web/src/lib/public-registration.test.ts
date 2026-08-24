import { describe, expect, it } from "vitest"
import {
  publicRegistrationInstitutions,
  publicRegistrationPayload,
  publicRegistrationSchema,
} from "./public-registration"
import { legalAcceptanceReferences } from "./legal-documents"

const valid = {
  title: "Dr.",
  firstName: "Ivan",
  lastName: "Ivanov",
  email: "ivan@example.test",
  password: "Strong!1",
  confirmPassword: "Strong!1",
  country: "Bulgaria",
  institutionId: "hospital-1",
  acceptedTerms: true,
}

describe("public registration contract", () => {
  it("requires a country and a real institution", () => {
    expect(publicRegistrationSchema.safeParse(valid).success).toBe(true)
    expect(publicRegistrationSchema.safeParse({ ...valid, institutionId: "" }).success).toBe(false)
    expect(publicRegistrationSchema.safeParse({ ...valid, institutionId: "no-institution" }).success).toBe(false)
    expect(publicRegistrationSchema.safeParse({ ...valid, country: "" }).success).toBe(false)
  })

  it("does not offer sentinel or generic institution rows", () => {
    expect(publicRegistrationInstitutions([
      { id: "hospital-1", name: "University Hospital", city: "Sofia" },
      { id: "no-institution", name: "Без институция", city: "—" },
      { id: "other", name: "Other / Private", city: "—" },
    ])).toEqual([{ id: "hospital-1", name: "University Hospital", city: "Sofia" }])
  })

  it("submits only the current API registration fields", () => {
    const parsed = publicRegistrationSchema.parse(valid)
    const legalAcceptances = legalAcceptanceReferences("bg")
    expect(publicRegistrationPayload(parsed, "bg", legalAcceptances)).toEqual({
      title: "Dr.",
      firstName: "Ivan",
      lastName: "Ivanov",
      email: "ivan@example.test",
      password: "Strong!1",
      institutionId: "hospital-1",
      locale: "bg",
      legalAcceptances,
    })
  })
})
