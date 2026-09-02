import { describe, expect, it } from "vitest"
import { buildPreopPayload } from "./preop-payload"
import { preopFormSchema } from "./preop-form-schema"

// The phone sends diffs, so `undefined` legitimately means "not in this save"
// and the stored value must stand. That is correct — and it is exactly why a
// clear could never be expressed: the steppers emitted `undefined` when a field
// was emptied, canonicalizePreopPatch dropped the key, and the old reading
// stayed on the record while the field showed empty.
//
// `null` is the clear. These pin both directions, because collapsing either
// into the other loses clinical data: one direction leaves a withdrawn reading
// on the record, the other wipes every field a partial save did not mention.
describe("clearing a vital on the phone reaches the server", () => {
  it("keeps an explicit clear in the payload as null", () => {
    const payload = buildPreopPayload({ bpSystolic: null, heartRate: 72 }) as Record<string, unknown>

    expect("bpSystolic" in payload).toBe(true)
    expect(payload.bpSystolic).toBeNull()
    expect(payload.heartRate).toBe(72)
  })

  it("omits a field the clinician never touched, so the stored value stands", () => {
    const payload = buildPreopPayload({ heartRate: 72 }) as Record<string, unknown>

    expect("bpSystolic" in payload).toBe(false)
  })

  it("treats an emptied text field as a clear, not as zero", () => {
    const payload = buildPreopPayload({ spO2: "" }) as Record<string, unknown>

    expect(payload.spO2).toBeNull()
  })

  it("accepts null through form validation instead of rejecting it", () => {
    // Before this the vitals were `.optional()` without `.nullable()`, so the
    // schema refused the very value that expresses a clear — z.number() takes
    // neither null nor a coercion from it.
    const parsed = preopFormSchema.safeParse({
      heightCm: 170,
      weightKg: 70,
      bpSystolic: null,
      spO2: null,
      heartRate: null,
    })

    const vitalIssues = parsed.success
      ? []
      : parsed.error.issues.filter(issue =>
        ["bpSystolic", "spO2", "heartRate"].includes(String(issue.path[0])))

    expect(vitalIssues).toEqual([])
  })

  it("keeps a recorded zero distinct from a clear", () => {
    const payload = buildPreopPayload({ spO2: 0 }) as Record<string, unknown>

    expect(payload.spO2).toBe(0)
  })
})
