import { describe, expect, it } from "vitest"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { formPatchFromEventOps } from "./event-patch-form"

const answer = (id: string, at: string, patch: Record<string, unknown>) =>
  ({ id, ts: at, type: "prompt_answer", recordedAt: at, intraopPatch: patch }) as unknown as IntraopEventOps["add"][number]
const ops = (add: IntraopEventOps["add"], update: IntraopEventOps["update"] = []): Pick<IntraopEventOps, "add" | "update"> => ({ add, update })

describe("the form values a saved event sets (found 2026-11-11: an answered technique left the form, and so the next question, on the old state)", () => {
  it("takes the technique an answer names", () => {
    const patch = formPatchFromEventOps(ops([answer("a1", "2026-11-11T19:43:24.131Z", { techniques: ["GENERAL_INHALATION"] })]))
    expect(patch).toEqual({ techniques: ["GENERAL_INHALATION"] })
  })

  it("takes the sides with it", () => {
    const patch = formPatchFromEventOps(ops([answer("a1", "2026-11-11T19:50:00.000Z", { techniques: ["BLOCK_FEMORAL"], techniqueSides: { BLOCK_FEMORAL: "LEFT" } })]))
    expect(patch).toEqual({ techniques: ["BLOCK_FEMORAL"], techniqueSides: { BLOCK_FEMORAL: "LEFT" } })
  })

  it("lets the latest event win a field, whatever order the operation lists them in", () => {
    const later = answer("a2", "2026-11-11T19:55:00.000Z", { techniques: ["GENERAL_TIVA"] })
    const earlier = answer("a1", "2026-11-11T19:43:00.000Z", { techniques: ["GENERAL_INHALATION"] })
    expect(formPatchFromEventOps(ops([later, earlier]))).toEqual({ techniques: ["GENERAL_TIVA"] })
  })

  it("reads edits as well as new events", () => {
    expect(formPatchFromEventOps(ops([], [answer("a1", "2026-11-11T19:43:24.131Z", { techniques: ["SEDATION_MAC"] })]))).toEqual({ techniques: ["SEDATION_MAC"] })
  })

  it("takes the airway an induction answer names, with every per-kind field, as the airway panel would set them", () => {
    const patch = formPatchFromEventOps(ops([answer("a1", "2026-11-11T19:43:14.636Z", {
      techniques: ["GENERAL_INHALATION"], airwayDevices: ["ORAL_ETT"], airwayDeviceEntries: [{ id: "x", device: "ORAL_ETT" }], airwayTools: ["DIRECT_LARY"],
      oralTubeSize: 7.5, oralCuffed: true, lmaSize: null,
    })]))
    expect(patch).toEqual({
      techniques: ["GENERAL_INHALATION"], airwayDevices: ["ORAL_ETT"], airwayDeviceEntries: [{ id: "x", device: "ORAL_ETT" }], airwayTools: ["DIRECT_LARY"],
      oralTubeSize: 7.5, oralCuffed: true, lmaSize: null,
    })
  })

  it("leaves the vascular fields and anything else to the panels and the saves that write them", () => {
    const patch = formPatchFromEventOps(ops([answer("a1", "2026-11-11T19:43:14.636Z", { vascularAccesses: [{ id: "y" }], notes: "free text", techniques: ["GENERAL_INHALATION"] })]))
    expect(patch).toEqual({ techniques: ["GENERAL_INHALATION"] })
  })

  it("takes nothing from events without a patch", () => {
    expect(formPatchFromEventOps(ops([{ id: "d", ts: "2026-11-11T19:43:38.000Z", type: "drug", name: "Propofol" } as unknown as IntraopEventOps["add"][number]]))).toEqual({})
    expect(formPatchFromEventOps(ops([]))).toEqual({})
  })
})
