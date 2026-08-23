// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "../../../../../messages/en.json"
import CasePage from "./page"

const hoisted = vi.hoisted(() => ({ apiServerFetch: vi.fn(), role: "MEMBER" as string }))

vi.mock("@/lib/live-session", () => ({
  getLiveSession: vi.fn(async () => ({ user: { id: "clinician-1", role: hoisted.role } })),
  apiServerFetch: hoisted.apiServerFetch,
}))
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
vi.mock("@/components/LiveCaseUpdater", () => ({ LiveCaseUpdater: () => null }))
vi.mock("@/components/CaseSummary", () => ({ CaseSummary: () => null }))
vi.mock("@/components/CaseMeta", () => ({ CaseMeta: () => null }))
vi.mock("@/components/HandoverHistory", () => ({ HandoverHistory: () => null }))
vi.mock("@/components/CentralCaseExportControl", () => ({
  CentralCaseExportControl: ({ caseId }: { caseId: string }) => (
    <div data-testid="central-case-export-control">{caseId}</div>
  ),
}))

function caseRecord(patientReference?: unknown, createdById = "another-clinician") {
  return {
    createdAt: "2026-08-13T07:00:00.000Z",
    createdById,
    caseCode: "2026-0001",
    notes: null,
    preop: { plannedProcedure: "Appendectomy", diagnosis: "Appendicitis", ageYears: 47, sex: "FEMALE" },
    intraop: null,
    user: { institution: { name: "Hospital" } },
    patientReference,
  }
}

async function renderCasePage() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {await CasePage({ params: Promise.resolve({ id: "case-1" }) })}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  hoisted.role = "MEMBER"
  hoisted.apiServerFetch.mockReset()
})

describe("Hospital case detail patient reference", () => {
  it("shows only the masked identifier on the final readback page", async () => {
    const rawNumber = "HOSP-PRIVATE-001"
    hoisted.apiServerFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => caseRecord({ id: "patient-link-1", maskedIdentifier: "HO****01" }),
    })

    await renderCasePage()
    expect(screen.getByTestId("masked-patient-identifier").textContent).toBe("HO****01")
    expect(screen.queryByRole("button", { name: /correct/i })).toBeNull()
    expect(document.body.textContent).not.toContain(rawNumber)
  })
})

describe("Hospital case detail Central governance", () => {
  it.each(["ADMIN", "HEAD_OF_DEPT"])("mounts the isolated control for %s", async role => {
    hoisted.role = role
    hoisted.apiServerFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => caseRecord(),
    })

    await renderCasePage()

    expect(screen.getByTestId("central-case-export-control").textContent).toBe("case-1")
  })

  it("mounts the isolated control for the Member who created the case", async () => {
    hoisted.role = "MEMBER"
    hoisted.apiServerFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => caseRecord(undefined, "clinician-1"),
    })

    await renderCasePage()

    expect(screen.getByTestId("central-case-export-control").textContent).toBe("case-1")
  })

  it.each(["MEMBER", "CLINICIAN", "RESEARCHER"])("does not mount another creator's control for %s", async role => {
    hoisted.role = role
    hoisted.apiServerFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => caseRecord(),
    })

    await renderCasePage()

    expect(screen.queryByTestId("central-case-export-control")).toBeNull()
  })
})
