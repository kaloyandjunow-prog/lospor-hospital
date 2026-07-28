import { describe, expect, it } from "vitest"
import { normaliseHandoverCodes, postopFormSchema } from "./postop-form-schema"

describe("postop form schema", () => {
  it("normalises legacy handover codes", () => {
    expect(normaliseHandoverCodes(["obs_q15", "pain_pca", "custom"])).toEqual(["obs_freq", "pca", "custom"])
  })

  it("defaults score and handover fields", () => {
    const parsed = postopFormSchema.parse({})
    expect(parsed.aldreteActivity).toBe(0)
    expect(parsed.handoverItems).toEqual([])
    expect(parsed.ponv).toBe(false)
  })
})
