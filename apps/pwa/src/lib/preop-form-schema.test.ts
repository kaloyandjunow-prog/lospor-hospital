import { describe, expect, it } from "vitest"
import { preopFormSchema } from "./preop-form-schema"

describe("preop exact-age schema", () => {
  it("supports exact pediatric age without maturity fields", () => {
    expect(preopFormSchema.shape.ageValue.safeParse(6).success).toBe(true)
    expect(preopFormSchema.shape.ageUnit.safeParse("MONTHS").success).toBe(true)
    expect("prematurityStatus" in preopFormSchema.shape).toBe(false)
    expect("gestationalAgeAtBirthDays" in preopFormSchema.shape).toBe(false)
    expect("postmenstrualAgeWeeks" in preopFormSchema.shape).toBe(false)
  })
})