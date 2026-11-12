import { describe, expect, it } from "vitest"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { statePatchFromEventOps } from "./event-patch-state"

const answer = (id: string, at: string, patch: Record<string, unknown>) =>
  ({ id, ts: at, type: "prompt_answer", recordedAt: at, intraopPatch: patch }) as unknown as IntraopEventOps["add"][number]

describe("the screen state a saved answer sets (found 2026-11-11 on the web: an answered technique left the screen on the old state)", () => {
  it("takes the technique and the sides an answer names", () => {
    const patch = statePatchFromEventOps({ add: [answer("a1", "2026-11-11T19:50:00.000Z", { techniques: ["BLOCK_FEMORAL"], techniqueSides: { BLOCK_FEMORAL: "LEFT" } })], update: [] })
    expect(patch).toEqual({ techniques: ["BLOCK_FEMORAL"], techniqueSides: { BLOCK_FEMORAL: "LEFT" } })
  })

  it("lets the latest event win, and reads edits too", () => {
    const later = answer("a2", "2026-11-11T19:55:00.000Z", { techniques: ["GENERAL_TIVA"] })
    const earlier = answer("a1", "2026-11-11T19:43:00.000Z", { techniques: ["GENERAL_INHALATION"] })
    expect(statePatchFromEventOps({ add: [later], update: [earlier] })).toEqual({ techniques: ["GENERAL_TIVA"] })
  })

  it("leaves airway and vascular fields to their panels, and takes nothing from an event without a patch", () => {
    expect(statePatchFromEventOps({ add: [answer("a1", "2026-11-11T19:43:14.000Z", { airwayDevices: ["ORAL_ETT"], vascularAccesses: [{ id: "y" }] })], update: [] })).toEqual({})
    expect(statePatchFromEventOps({ add: [{ id: "d", ts: "2026-11-11T19:43:38.000Z", type: "drug" } as never], update: [] })).toEqual({})
  })

  it("keeps only text codes", () => {
    expect(statePatchFromEventOps({ add: [answer("a1", "2026-11-11T19:50:00.000Z", { techniques: ["GENERAL_INHALATION", 7, null] })], update: [] })).toEqual({ techniques: ["GENERAL_INHALATION"] })
  })
})
