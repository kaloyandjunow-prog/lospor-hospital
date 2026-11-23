import { describe, expect, it } from "vitest"
import { intraopAttentionItems, intraopAttentionText, intraopResolveAttention } from "./intraop-attention"
import { applyIntraopEventOps } from "./intraop-timetable-edit"
import type { LogEvent } from "./intraop-types"

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 22, 8, minutes)).toISOString()

// 10.8.0 (rule 9): a tourniquet still on when the case ends must come off on the record.
describe("a tourniquet still on at the end", () => {
  const log: LogEvent[] = [{ id: "on", ts: at(10), type: "clinical_event", label: "Tourniquet on", site: "left thigh" } as LogEvent]
  const context = { now: at(70), endedAt: at(60) }

  it("is asked at End case, in both languages", () => {
    const items = intraopAttentionItems(log, context)
    expect(items).toEqual([expect.objectContaining({ key: "tourniquet:on", kind: "tourniquet_open", actions: ["tourniquet_off"] })])
    expect(intraopAttentionText(items[0]!, "bg")).toContain("Турникетът")
  })

  it("is answered by a Tourniquet off at the end, at the same site", () => {
    const ops = intraopResolveAttention(log, "tourniquet:on", "tourniquet_off", context)
    expect(ops.add).toEqual([expect.objectContaining({ type: "clinical_event", label: "Tourniquet off", ts: at(60), site: "left thigh" })])
    const after = applyIntraopEventOps(log, ops) as LogEvent[]
    expect(intraopAttentionItems(after, context)).toEqual([])
  })

  it("is not asked while the case runs", () => {
    expect(intraopAttentionItems(log, { now: at(70) })).toEqual([])
  })
})
