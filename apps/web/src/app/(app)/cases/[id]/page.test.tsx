// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import CasePage from "./page"

const hoisted = vi.hoisted(() => ({ apiServerFetch: vi.fn() }))

vi.mock("@/lib/live-session", () => ({
  getLiveSession: vi.fn(async () => ({ user: { id: "clinician-1" } })),
  apiServerFetch: hoisted.apiServerFetch,
}))
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
vi.mock("@/components/LiveCaseUpdater", () => ({ LiveCaseUpdater: () => null }))
vi.mock("@/components/CaseSummary", () => ({ CaseSummary: () => null }))
vi.mock("@/components/CaseMeta", () => ({ CaseMeta: () => null }))

describe("Hospital case detail patient reference", () => {
  it("shows only the masked identifier on the final readback page", async () => {
    const rawNumber = "HOSP-PRIVATE-001"
    hoisted.apiServerFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        createdAt: "2026-08-13T07:00:00.000Z",
        caseCode: "2026-0001",
        notes: null,
        preop: { plannedProcedure: "Appendectomy", diagnosis: "Appendicitis", ageYears: 47, sex: "FEMALE" },
        intraop: null,
        user: { institution: { name: "Hospital" } },
        patientReference: { id: "patient-link-1", maskedIdentifier: "HO****01" },
      }),
    })

    render(await CasePage({ params: Promise.resolve({ id: "case-1" }) }))
    expect(screen.getByTestId("masked-patient-identifier").textContent).toBe("HO****01")
    expect(screen.queryByRole("button", { name: /correct/i })).toBeNull()
    expect(document.body.textContent).not.toContain(rawNumber)
  })
})
