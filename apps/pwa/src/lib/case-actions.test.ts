import { describe, expect, it } from "vitest"
import { caseScreenActions, dashboardMenuActions, type CaseActionInput } from "./case-actions"

const STARTED = { startedAt: "2026-10-28T08:00:00.000Z" }
const menu = (input: Partial<CaseActionInput>) => dashboardMenuActions({ writable: true, ...input })

describe("the dashboard's long-press menu", () => {
  it("offers an open case everything an editor needs", () => {
    expect(menu({ status: "DRAFT" })).toEqual({
      print: false, cancel: "available", undoCancel: false, remove: true, theatre: false, handOver: true, withdrawHandover: false,
    })
  })

  it("keeps the cancellation in place, inactive, once anaesthesia has started (an instant or a legacy wall clock)", () => {
    expect(menu({ status: "IN_PROGRESS", intraop: STARTED }).cancel).toBe("inactive")
    expect(menu({ status: "IN_PROGRESS", intraop: { startTime: "08:00" } }).cancel).toBe("inactive")
    expect(menu({ status: "IN_PROGRESS", intraop: { startedAt: null, startTime: null } }).cancel).toBe("available")
  })

  it("closes a cancelled procedure like a finished case: undo only, no delete, handover or second cancellation", () => {
    expect(menu({ status: "CANCELLED" })).toMatchObject({ cancel: null, undoCancel: true, remove: false, handOver: false, print: false })
  })

  it("offers a finished case its printout and nothing to change", () => {
    expect(menu({ status: "COMPLETE", intraop: STARTED })).toMatchObject({ print: true, cancel: null, undoCancel: false, remove: false, handOver: false })
  })

  it("offers someone who cannot edit the case no change at all", () => {
    for (const status of ["DRAFT", "CANCELLED"]) {
      expect(menu({ status, writable: false })).toMatchObject({ cancel: null, undoCancel: false, remove: false, handOver: false })
    }
  })

  it("offers the theatre only while it can change, and the withdrawal instead of a second handover", () => {
    expect(menu({ status: "DRAFT", theatreChangeable: true }).theatre).toBe(true)
    expect(menu({ status: "DRAFT", pendingTransfer: true })).toMatchObject({ handOver: false, withdrawHandover: true })
  })
})

describe("the case screen", () => {
  it("edits an open case, and opens its timetable live", () => {
    expect(caseScreenActions({ status: "IN_PROGRESS", writable: true })).toEqual({ edit: true, timetableReadOnly: false })
  })

  it("reads a cancelled procedure or a finished case, with its timetable read-only", () => {
    expect(caseScreenActions({ status: "CANCELLED", writable: true })).toEqual({ edit: false, timetableReadOnly: true })
    expect(caseScreenActions({ status: "COMPLETE", writable: true })).toEqual({ edit: false, timetableReadOnly: true })
  })

  it("edits nothing for someone who cannot edit the case", () => {
    expect(caseScreenActions({ status: "DRAFT", writable: false }).edit).toBe(false)
  })
})
