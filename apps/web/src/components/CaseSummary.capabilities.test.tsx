// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import type { CaseDetail } from "@/types/case-detail"
import enMessages from "../../messages/en.json"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

// The chart needs real geometry and is not what these tests are about.
vi.mock("@/components/case-summary/PrintTimetable", () => ({
  PrintTimetable: () => <div data-testid="print-timetable" />,
  calcDrugTotals: () => [],
  calcInfTotals: () => [],
  buildDrugLog: () => [],
  naturalMaxCols: () => 12,
}))

import { CaseSummary } from "./CaseSummary"

const READ_ONLY_NOTICE = enMessages.case.handedOnReadOnly

function caseFixture(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: "case-1",
    caseCode: "AB-1234",
    notes: null,
    userId: "user-1",
    createdById: "user-1",
    institutionId: "inst-1",
    status: "IN_PROGRESS",
    clinicalMode: "ADULT",
    finalizedAt: null,
    createdAt: "2026-08-01T06:00:00.000Z",
    updatedAt: "2026-08-01T06:00:00.000Z",
    institution: { name: "Test Hospital", city: "Sofia" },
    capabilities: { canRead: true, canWrite: true, isCreator: true, isAssignee: true },
    preop: { ageYears: 42, sex: "FEMALE" } as unknown as CaseDetail["preop"],
    intraop: {
      startTime: "2000-01-01T08:00:00.000Z",
      endTime: "2000-01-01T09:00:00.000Z",
      monthYear: "2026-08",
      keyEvents: { vitals: {} },
    } as unknown as CaseDetail["intraop"],
    postop: { disposition: "WARD" } as unknown as CaseDetail["postop"],
    ...overrides,
  }
}

function renderSummary(data: CaseDetail) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <CaseSummary caseId="case-1" initialData={data} />
    </NextIntlClientProvider>,
  )
}

/** The three step links plus the finalize button — everything a write needs. */
function writeControls() {
  return {
    preop:      screen.queryByRole("link", { name: "Preop" }),
    intraop:    screen.queryByRole("link", { name: "Intraop" }),
    postop:     screen.queryByRole("link", { name: "Postop" }),
    closeNow:   screen.queryByRole("button", { name: "Close Now" }),
    unfinalize: screen.queryByRole("button", { name: "Unfinalize" }),
  }
}

describe("CaseSummary — write affordances follow the API capabilities", () => {
  it("offers the edit links and the finalize button to the current assignee", () => {
    renderSummary(caseFixture())

    const controls = writeControls()
    expect(controls.preop?.getAttribute("href")).toBe("/cases/new?continue=case-1&step=0")
    expect(controls.intraop?.getAttribute("href")).toBe("/cases/new?continue=case-1&step=1")
    expect(controls.postop?.getAttribute("href")).toBe("/cases/new?continue=case-1&step=2")
    expect(controls.closeNow).toBeTruthy()
    expect(screen.queryByText(READ_ONLY_NOTICE)).toBeNull()
  })

  it("offers none of them to a creator who has handed the case on", () => {
    renderSummary(caseFixture({
      capabilities: { canRead: true, canWrite: false, isCreator: true, isAssignee: false },
    }))

    const controls = writeControls()
    expect(controls.preop).toBeNull()
    expect(controls.intraop).toBeNull()
    expect(controls.postop).toBeNull()
    expect(controls.closeNow).toBeNull()
    // The absence has to be explained, or it reads as the page being broken.
    expect(screen.getByText(READ_ONLY_NOTICE)).toBeTruthy()
  })

  it("keeps the print link for a handed-on case that is finished", () => {
    // Read and print survive the handover; only write is lost. A finalized case
    // is the one that carries a print link, so this is where to check it.
    renderSummary(caseFixture({
      status: "COMPLETE",
      finalizedAt: new Date().toISOString(),
      capabilities: { canRead: true, canWrite: false, isCreator: true, isAssignee: false },
    }))

    expect(writeControls().unfinalize).toBeNull()
    expect(screen.getByRole("link", { name: "Print case" }).getAttribute("href"))
      .toBe("/cases/case-1/print")
    expect(screen.getByText(READ_ONLY_NOTICE)).toBeTruthy()
  })

  it("still offers Unfinalize to the assignee of a case just finished", () => {
    // Control for the test above: the print link is not what hides the button.
    renderSummary(caseFixture({
      status: "COMPLETE",
      finalizedAt: new Date().toISOString(),
    }))

    expect(writeControls().unfinalize).toBeTruthy()
  })

  it("treats a response with no capabilities at all as read-only", () => {
    // Fail closed. An older server, or a body that lost the field on the way,
    // must not be the thing that hands out edit rights.
    renderSummary(caseFixture({ capabilities: undefined }))

    const controls = writeControls()
    expect(controls.preop).toBeNull()
    expect(controls.closeNow).toBeNull()
    expect(screen.getByText(READ_ONLY_NOTICE)).toBeTruthy()
  })

  it("treats a malformed capabilities object as read-only", () => {
    renderSummary(caseFixture({
      capabilities: { canWrite: "yes" } as unknown as CaseDetail["capabilities"],
    }))

    expect(writeControls().closeNow).toBeNull()
    expect(screen.getByText(READ_ONLY_NOTICE)).toBeTruthy()
  })
})
