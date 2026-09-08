// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DashboardSearch } from "./DashboardSearch"

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/components/DeleteDraftButton", () => ({
  DeleteDraftButton: () => <button data-testid="delete-draft">delete</button>,
}))

vi.mock("@/components/HandoverButton", () => ({
  HandoverButton: () => <div data-testid="handover" />,
}))

const baseCase = {
  id: "case-1",
  caseCode: "C-001",
  status: "IN_PROGRESS",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  userId: "owner-1",
  preop: { diagnosis: "Appendicitis", plannedProcedure: "Appendectomy", asaScore: "II", sex: "MALE" },
  intraop: null,
  postop: null,
  transfers: [],
}

describe("DashboardSearch permissions", () => {
  it("links a writable, non-complete case into the edit wizard", () => {
    const { container } = render(
      <DashboardSearch
        cases={[{ ...baseCase, capabilities: { canWrite: true } }]}
        userId="owner-1"
        role="CLINICIAN"
      />,
    )
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/cases/new?continue=case-1")
  })

  it("opens the read-only summary for a non-complete case the reader cannot write to", () => {
    // A case handed to a colleague: still visible, no longer writable. It
    // must not route into an editor the server will refuse to save from.
    const { container } = render(
      <DashboardSearch
        cases={[{ ...baseCase, capabilities: { canWrite: false } }]}
        userId="owner-1"
        role="CLINICIAN"
      />,
    )
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/cases/case-1")
  })

  it("fails closed to read-only when a case carries no capabilities at all", () => {
    const { container } = render(
      <DashboardSearch
        cases={[{ ...baseCase, capabilities: undefined }]}
        userId="owner-1"
        role="CLINICIAN"
      />,
    )
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/cases/case-1")
    expect(screen.queryByTestId("delete-draft")).toBeFalsy()
  })

  it("still opens a complete case's summary even when it is writable", () => {
    const { container } = render(
      <DashboardSearch
        cases={[{ ...baseCase, status: "COMPLETE", capabilities: { canWrite: true } }]}
        userId="owner-1"
        role="CLINICIAN"
      />,
    )
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/cases/case-1")
  })
})

describe("DashboardSearch age display", () => {
  it("shows a neonate's age instead of hiding it as falsy", () => {
    render(
      <DashboardSearch
        cases={[{ ...baseCase, preop: { ...baseCase.preop, ageYears: 0 }, capabilities: { canWrite: true } }]}
        userId="owner-1"
        role="CLINICIAN"
      />,
    )
    expect(screen.getByText(/0y/)).toBeTruthy()
  })

  it("renders a precise days/months age when the record carries one", () => {
    render(
      <DashboardSearch
        cases={[{
          ...baseCase,
          preop: { ...baseCase.preop, ageYears: 0, ageValue: 12, ageUnit: "DAYS" },
          capabilities: { canWrite: true },
        }]}
        userId="owner-1"
        role="CLINICIAN"
      />,
    )
    expect(screen.getByText(/12 days/)).toBeTruthy()
  })
})

describe("DashboardSearch status badge", () => {
  const render1 = (over: Record<string, unknown>) => {
    render(
      <DashboardSearch
        cases={[{ ...baseCase, ...over, capabilities: { canWrite: true } } as never]}
        userId="owner-1"
        role="CLINICIAN"
      />,
    )
  }

  /**
   * The status that is actually time-critical, and the one this used to get
   * exactly backwards. A case in its closure window has a finished intraop and
   * a complete postop, and the intraop check came first -- so the countdown
   * that finalises the record showed as "awaiting postop", the state it had
   * just left.
   */
  it("labels a case in its review window as awaiting review, not awaiting postop", () => {
    render1({
      status: "AWAITING_REVIEW",
      intraop: { endTime: "2026-09-07T09:30:00.000Z" },
      postop: { disposition: "WARD" },
    })
    expect(screen.getByText("Awaiting review")).toBeTruthy()
  })

  // A case created directly in review has no intraop record at all, so it fell
  // past every check to "awaiting allocation" -- a case that is finishing,
  // labelled as one that has not started.
  it("labels an awaiting-review case with no intraop record the same way", () => {
    render1({ status: "AWAITING_REVIEW", intraop: null })
    expect(screen.getByText("Awaiting review")).toBeTruthy()
  })

  /**
   * Allocation readiness is now core's single rule, shared with mobile. The two
   * clients used to disagree in both directions: this one demanded a diagnosis
   * and ignored age and sex, mobile did the reverse, so the same case read as
   * ready to schedule on one and not the other.
   */
  it("requires age and sex for allocation, which this client used to ignore", () => {
    render1({ status: "DRAFT", preop: { ...baseCase.preop, ageYears: 34 } })
    expect(screen.getByText("Awaiting allocation")).toBeTruthy()
  })

  it("is not ready to allocate when age is missing", () => {
    render1({ status: "DRAFT" })
    expect(screen.queryByText("Awaiting allocation")).toBeNull()
  })

  // UNKNOWN is a truthy string meaning "nobody has recorded this yet", so it
  // has to fail here exactly as a blank does.
  it("does not treat an UNKNOWN sex as recorded", () => {
    render1({ status: "DRAFT", preop: { ...baseCase.preop, ageYears: 34, sex: "UNKNOWN" } })
    expect(screen.queryByText("Awaiting allocation")).toBeNull()
  })
})
