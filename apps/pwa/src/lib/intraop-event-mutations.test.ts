import { describe, expect, it } from "vitest"

import type { LogEvent } from "@/lib/intraop-log-event"
import { planEventMutations } from "@/lib/intraop-event-mutations"

describe("intraoperative event mutation planning", () => {
  it("plans a same-ID vital edit as one upsert and no delete", () => {
    const before = [{ id: "vital-1", ts: "2026-09-15T08:00:00.000Z", type: "vital", bis: 50 }] as LogEvent[]
    const after = [{ ...before[0], bis: 60, syncStatus: "pending" }] as LogEvent[]

    expect(planEventMutations(before, after)).toEqual([
      expect.objectContaining({ kind: "event.upsert", eventId: "vital-1" }),
    ])
  })
})
