// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CentralDeliveryPage from "./page"

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), accountKind: "CLINICAL" }))

vi.mock("@/lib/live-session", () => ({
  getLiveSession: vi.fn(async () => ({ user: { id: "creator-1", accountKind: mocks.accountKind } })),
  apiServerFetch: mocks.fetch,
}))
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) => (
    values ? `${key}:${JSON.stringify(values)}` : key
  )),
}))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock("@/components/CentralCaseExportControl", () => ({
  CentralCaseExportControl: ({ caseId, initialControl }: { caseId: string; initialControl: { state: string } }) => (
    <div data-testid="central-control">{caseId}:{initialControl.state}</div>
  ),
}))

const control = {
  schemaVersion: 2,
  state: "ACCEPTED",
  decidedAt: null,
  lastBatch: null,
  canWithdraw: true,
  canResend: false,
}

beforeEach(() => {
  mocks.accountKind = "CLINICAL"
  mocks.fetch.mockReset()
})

describe("Central delivery discovery page", () => {
  it("renders a transferred creator's bounded item and pagination without clinical data", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({
      schemaVersion: 1,
      cases: [{ caseId: "transferred-case", finalizedAt: "2026-08-23T10:00:00.000Z", control }],
      page: 1,
      pageSize: 20,
      total: 42,
    }) })
    render(await CentralDeliveryPage({ searchParams: Promise.resolve({ page: "1" }) }))

    expect(screen.getByTestId("central-control").textContent).toBe("transferred-case:ACCEPTED")
    expect(screen.getByRole("link", { name: /previous/i }).getAttribute("href")).toBe("/central-delivery")
    expect(screen.getByRole("link", { name: /next/i }).getAttribute("href")).toBe("/central-delivery?page=2")
    expect(document.body.textContent).not.toMatch(/patient|assignee|case code|pseudonym|batch/i)
  })

  it("fails closed for an extra clinical field", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({
      schemaVersion: 1,
      cases: [{ caseId: "case-1", finalizedAt: "2026-08-23T10:00:00.000Z", control, patientNumber: "SECRET" }],
      page: 0,
      pageSize: 20,
      total: 1,
    }) })
    render(await CentralDeliveryPage({}))
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(document.body.textContent).not.toContain("SECRET")
    expect(screen.queryByTestId("central-control")).toBeNull()
  })

  it("does not render for a research-only session", async () => {
    mocks.accountKind = "RESEARCH_ONLY"
    expect(await CentralDeliveryPage({})).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
