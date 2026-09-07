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
