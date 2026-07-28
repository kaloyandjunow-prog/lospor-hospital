import { describe, expect, it } from "vitest"
import type { LogEvent } from "./intraop-log-event"
import { applyIntraopEventEdit, intraopEventEditDraft } from "./intraop-event-edit"

const ev = (event: Partial<LogEvent>): LogEvent => event as LogEvent

describe("intraopEventEditDraft", () => {
  it("initializes dose for drugs and leaves non-drug dose empty", () => {
    const ts = new Date(2026, 0, 1, 8, 5).toISOString()
    expect(intraopEventEditDraft(ev({ type: "drug", ts, dose: "100" }))).toEqual({ dose: "100", time: "08:05" })
    expect(intraopEventEditDraft(ev({ type: "clinical_event", ts }))).toEqual({ dose: "", time: "08:05" })
  })
})

describe("applyIntraopEventEdit", () => {
  it("updates drug dose and local time for the selected event", () => {
    const original = new Date(2026, 0, 1, 8, 0)
    const other = ev({ id: "other", type: "drug", ts: original.toISOString(), dose: "50" })
    const edited = ev({ id: "edit", type: "drug", ts: original.toISOString(), dose: "100" })

    const next = applyIntraopEventEdit([other, edited], "edit", "09:15", "125")

    expect(next[0]).toBe(other)
    expect(next[1]).toMatchObject({ id: "edit", dose: "125" })
    expect(new Date(next[1].ts).getHours()).toBe(9)
    expect(new Date(next[1].ts).getMinutes()).toBe(15)
  })

  it("updates time without adding dose for non-drug events", () => {
    const original = new Date(2026, 0, 1, 8, 0)
    const [next] = applyIntraopEventEdit([
      ev({ id: "event", type: "clinical_event", ts: original.toISOString(), label: "Hypotension" }),
    ], "event", "10:30", "999")

    expect(next).not.toHaveProperty("dose")
    expect(new Date(next.ts).getHours()).toBe(10)
    expect(new Date(next.ts).getMinutes()).toBe(30)
  })

  it("keeps the original timestamp when edit time is invalid", () => {
    const original = ev({ id: "event", type: "clinical_event", ts: new Date(2026, 0, 1, 8, 0).toISOString() })
    expect(applyIntraopEventEdit([original], "event", "bad", "")[0].ts).toBe(original.ts)
  })
})
