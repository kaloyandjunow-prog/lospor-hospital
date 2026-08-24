import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/hooks/useClinicalRules.ts"), "utf8")

// The old hospital-only `guidance: {enabled, prospectiveOnly}` field and its
// failClosedHospitalGuidance() normalizer are gone -- useClinicalRules now
// derives prospectiveGuidanceEnabled from evaluateClinicalBaseline(), which
// fails closed by construction (see clinical-baseline-safety.test.ts) rather
// than by an explicit normalizer applied to a raw snapshot field.
describe("Hospital clinical-guidance response policy", () => {
  it("delegates fail-closed guidance policy to evaluateClinicalBaseline", () => {
    expect(source).toContain("evaluateClinicalBaseline")
    expect(source).toContain("prospectiveGuidanceEnabled")
    expect(source).not.toContain("failClosedHospitalGuidance")
  })
})
