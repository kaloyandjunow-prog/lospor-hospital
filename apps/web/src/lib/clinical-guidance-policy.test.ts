import { describe, expect, it } from "vitest"
import { DISPLAY_CLINICAL_DOSE_GUIDANCE } from "./clinical-guidance-policy"

describe("clinical dose guidance policy", () => {
  it("preserves the established medication controls by default", () => {
    expect(DISPLAY_CLINICAL_DOSE_GUIDANCE).toBe(true)
  })
})
