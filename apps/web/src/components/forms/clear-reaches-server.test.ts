import { describe, it, expect } from "vitest"
import { schema as preopSchema } from "./preopSchema"

// The clear a clinician performs has to survive three hops: the stepper's
// onChange, the form schema, and JSON.stringify on the way to the API.
//
// It used to survive none of them. NumberStepper emitted `undefined`,
// JSON.stringify drops undefined keys entirely, and the API reads an absent key
// as "the client did not mention this field" and keeps what it has. So a
// clinician who cleared a blood pressure saw an empty field while the record
// still held the old reading — and the printed protocol, the risk scores and
// the research export all still saw it.
//
// The second failure mode was worse: `z.coerce.number()` without `.nullable()`
// turns null into 0, because Number(null) === 0. A cleared SpO2 would have been
// stored as 0%.
describe("clearing a numeric field reaches the server", () => {
  it("keeps null as null instead of coercing it to zero", () => {
    const parsed = preopSchema.partial().parse({ bpSystolic: null, spO2: null, heartRate: null })

    expect(parsed.bpSystolic).toBeNull()
    expect(parsed.spO2).toBeNull()
    expect(parsed.heartRate).toBeNull()
  })

  it("survives JSON.stringify, which silently drops undefined", () => {
    const cleared = JSON.parse(JSON.stringify(
      preopSchema.partial().parse({ bpSystolic: null, bpDiastolic: 80 }),
    )) as Record<string, unknown>

    // Present and null: the API reads this as an explicit clear.
    expect("bpSystolic" in cleared).toBe(true)
    expect(cleared.bpSystolic).toBeNull()
    expect(cleared.bpDiastolic).toBe(80)
  })

  it("still distinguishes a field the clinician never touched", () => {
    const untouched = JSON.parse(JSON.stringify(
      preopSchema.partial().parse({ bpSystolic: undefined }),
    )) as Record<string, unknown>

    // Absent, not null: the stored value must stand. Collapsing this into a
    // clear is the bug in the other direction — it would wipe every field a
    // partial save did not mention.
    expect("bpSystolic" in untouched).toBe(false)
  })

  it("keeps a real zero distinct from a clear", () => {
    const parsed = preopSchema.partial().parse({ spO2: 0 })
    expect(parsed.spO2).toBe(0)
  })
})
