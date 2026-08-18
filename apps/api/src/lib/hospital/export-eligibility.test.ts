import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { reserveCase, revisionsChanged } from "@/lib/hospital/export-batch"

type Row = Parameters<typeof revisionsChanged>[0]

function caseRow(over: Partial<Row> = {}): Row {
  return {
    clinicalRevision: 5,
    eventRevision: 3,
    relationalRevision: 2,
    preop: { syncRevision: 7 },
    intraop: { syncRevision: 8 },
    postop: null,
    centralExportCheckpoint: null,
    centralExportRejection: null,
    ...over,
  } as unknown as Row
}

const currentRevisions = {
  clinicalRevision: 5,
  eventRevision: 3,
  relationalRevision: 2,
  preopRevision: 7,
  intraopRevision: 8,
  postopRevision: null,
}

describe("offering a case to Central", () => {
  it("offers a case Central has never seen", () => {
    expect(revisionsChanged(caseRow())).toBe(true)
  })

  it("does not offer a case whose accepted state is unchanged", () => {
    expect(revisionsChanged(caseRow({
      centralExportCheckpoint: { lastAction: "UPSERT", ...currentRevisions },
    } as Partial<Row>))).toBe(false)
  })

  it("offers a case again once any section has been edited", () => {
    for (const changed of [
      { clinicalRevision: 6 },
      { eventRevision: 4 },
      { relationalRevision: 3 },
      { preopRevision: 8 },
      { intraopRevision: 9 },
      { postopRevision: 1 },
    ]) {
      expect(revisionsChanged(caseRow({
        centralExportCheckpoint: { lastAction: "UPSERT", ...currentRevisions, ...changed },
      } as Partial<Row>))).toBe(true)
    }
  })

  it("does not offer a state Central has already refused", () => {
    // This is the loop: a rejected batch is terminal, so nothing was active for
    // these cases, and with no record of the refusal they were rebuilt and sent
    // again every sixty seconds, consuming a sequence number each time.
    expect(revisionsChanged(caseRow({
      centralExportRejection: { ...currentRevisions, errorCode: "SCHEMA_INVALID" },
    } as Partial<Row>))).toBe(false)
  })

  it("offers a refused case again once it has been corrected", () => {
    // Editing the case is the right trigger to retry: a rejection almost always
    // means the data has to be fixed before Central will take it.
    expect(revisionsChanged(caseRow({
      centralExportRejection: {
        ...currentRevisions, clinicalRevision: 4, errorCode: "SCHEMA_INVALID",
      },
    } as Partial<Row>))).toBe(true)
  })

  it("keeps refusing a corrected-then-reverted case at the refused revisions", () => {
    // Revisions only advance, so this cannot arise from an edit; it guards the
    // rule itself, which is matched on the revision set rather than on time.
    expect(revisionsChanged(caseRow({
      centralExportRejection: { ...currentRevisions, errorCode: "SCHEMA_INVALID" },
      centralExportCheckpoint: { lastAction: "UPSERT", ...currentRevisions, clinicalRevision: 1 },
    } as Partial<Row>))).toBe(false)
  })
})

describe("a case and its patient link must agree on the hospital", () => {
  // identifierHash is HMAC'd with the institution, and the export pseudonym is
  // built from the case's institution plus that hash. If they disagree the
  // pseudonym corresponds to no PatientLink row anywhere, and the same patient
  // reaches Central under a second, invented identity -- permanently, for
  // anything already delivered.
  // reserveCase derives the export pseudonym, which needs a key. Any key will
  // do: these assertions are about which cases are offered, not about the
  // pseudonym's value.
  process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY ??= Buffer.alloc(32, 7).toString("base64")

  function exportable(over: Record<string, unknown> = {}) {
    return {
      id: "case-1",
      institutionId: "inst-1",
      finalizedAt: new Date("2026-08-18T08:00:00Z"),
      patientLink: { identifierHash: "hash-1", institutionId: "inst-1" },
      centralExportControl: null,
      ...over,
    } as unknown as Parameters<typeof reserveCase>[0]
  }

  it("offers a case whose link belongs to the same institution", () => {
    expect(reserveCase(exportable(), "UPSERT")).not.toBeNull()
  })

  it("declines a case whose link belongs to another institution", () => {
    // Only reachable for rows damaged before cross-institution transfer was
    // refused, which is exactly why the check has to outlive that fix.
    expect(reserveCase(exportable({
      patientLink: { identifierHash: "hash-1", institutionId: "inst-2" },
    }), "UPSERT")).toBeNull()
  })

  it("declines rather than inventing an identity from a missing link", () => {
    expect(reserveCase(exportable({ patientLink: null }), "UPSERT")).toBeNull()
    expect(reserveCase(exportable({ institutionId: null }), "UPSERT")).toBeNull()
  })
})

describe("the undo window and Central export are complementary", () => {
  // Finalizing can be undone for FINALIZE_UNDO_WINDOW_MS, and delivery runs
  // every 60 seconds. Before this, a case could reach Central inside its own
  // undo window and then be undone locally, leaving Central holding a finalized
  // version the hospital no longer had, with nothing recording the divergence.
  //
  // The fix is only complete because the two conditions are exact complements:
  // unfinalize refuses once the window has elapsed, and export refuses until it
  // has. Both must therefore derive from the same constant -- if either grew
  // its own number, cases could fall into the gap or into the overlap, and no
  // unit test of either side alone would notice.
  const source = (path: string) =>
    readFileSync(join(process.cwd(), "src", path), "utf8")

  it("selects for export only after the undo window has closed", () => {
    const batch = source("lib/hospital/export-batch.ts")
    expect(batch).toMatch(/FINALIZE_UNDO_WINDOW_MS/)
    expect(batch).toMatch(/finalizedAt: \{ not: null, lte: eligibleFrom \}/)
  })

  it("refuses to undo finalization after that same window", () => {
    const unfinalize = source("app/v1/cases/[id]/unfinalize/route.ts")
    expect(unfinalize).toMatch(/FINALIZE_UNDO_WINDOW_MS/)
  })

  it("takes the window from one definition, not two", () => {
    const constants = source("lib/constants.ts")
    expect(constants).toMatch(/export const FINALIZE_UNDO_WINDOW_MS/)
    // Anything else naming its own window would break the complementarity.
    for (const path of [
      "lib/hospital/export-batch.ts",
      "app/v1/cases/[id]/unfinalize/route.ts",
    ]) {
      expect(source(path)).toMatch(/import \{[\s\S]*?FINALIZE_UNDO_WINDOW_MS/)
    }
  })
})
