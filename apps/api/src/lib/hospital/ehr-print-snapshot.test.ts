import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { printableRecordFromSnapshot } from "./ehr-print-snapshot"

describe("the EHR printable record is frozen to its finalization", () => {
  it("does not read live clinical values while adding only display metadata", () => {
    const finalization = {
      id: "case-1",
      status: "COMPLETE",
      caseCode: "2026-0027",
      institutionId: "inst-1",
      preop: { diagnosis: "tonsillitis A" },
      intraop: { complications: "none A", crystalloidsMl: 500 },
      postop: { disposition: "WARD" },
    }
    const live = {
      ...finalization,
      preop: { diagnosis: "tonsillitis B" },
      intraop: { complications: "changed after finalization", crystalloidsMl: 1000 },
    }

    const record = printableRecordFromSnapshot(JSON.stringify(finalization), {
      name: "Demo Hospital", city: "Sofia",
    })

    expect(record).toMatchObject({
      id: "case-1",
      preop: finalization.preop,
      intraop: finalization.intraop,
      institution: { name: "Demo Hospital", city: "Sofia" },
      capabilities: { canRead: true, canWrite: false },
    })
    expect(record?.preop).not.toEqual(live.preop)
    expect(record?.intraop).not.toEqual(live.intraop)
  })

  it("rejects a corrupted snapshot instead of rendering a live fallback", () => {
    expect(printableRecordFromSnapshot("{broken", null)).toBeNull()
  })
})
