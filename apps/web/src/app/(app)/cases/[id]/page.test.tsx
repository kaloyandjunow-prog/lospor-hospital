// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "../../../../../messages/en.json"
import CasePage from "./page"

const hoisted = vi.hoisted(() => ({ apiServerFetch: vi.fn() }))

vi.mock("@/lib/live-session", () => ({
  getLiveSession: vi.fn(async () => ({ user: { id: "clinician-1", role: "MEMBER" } })),
  apiServerFetch: hoisted.apiServerFetch,
}))
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }))
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
  getTranslations: vi.fn(async () => (key: string) => {
    const value = key.split(".").reduce<unknown>(
      (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
      enMessages,
    )
    return typeof value === "string" ? value : key
  }),
}))
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
vi.mock("@/components/LiveCaseUpdater", () => ({ LiveCaseUpdater: () => null }))
vi.mock("@/components/CaseSummary", () => ({ CaseSummary: () => null }))
vi.mock("@/components/CaseMeta", () => ({ CaseMeta: () => null }))
vi.mock("@/components/HandoverHistory", () => ({ HandoverHistory: () => null }))
vi.mock("@/components/CentralCaseExportControl", () => ({
  CentralCaseExportControl: ({ caseId, initialControl }: {
    caseId: string
    initialControl?: { state: string }
  }) => (
    <div data-testid="central-case-export-control">{caseId}:{initialControl?.state}</div>
  ),
}))

function caseRecord(patientReference?: unknown) {
  return {
    createdAt: "2026-08-13T07:00:00.000Z",
    caseCode: "2026-0001",
    notes: null,
    preop: { plannedProcedure: "Appendectomy", diagnosis: "Appendicitis", ageYears: 47, sex: "FEMALE" },
    intraop: null,
    user: { institution: { name: "Hospital" } },
    patientReference,
  }
}

const acceptedControl = {
  schemaVersion: 2,
  state: "ACCEPTED",
  decidedAt: null,
  lastBatch: null,
  canWithdraw: true,
  canResend: false,
}

/**
 * The case record always loads. The delivery control is answered separately,
 * because the page no longer decides who holds it -- the API does.
 */
function mockApi({
  record = caseRecord(),
  control,
}: {
  record?: unknown
  control?: { status: number; body?: unknown }
} = {}) {
  hoisted.apiServerFetch.mockImplementation(async (path: string) => {
    if (path.includes("/export-control")) {
      const answer = control ?? { status: 403 }
      return {
        ok: answer.status >= 200 && answer.status < 300,
        status: answer.status,
        json: async () => answer.body ?? { error: "Forbidden" },
      }
    }
    return { ok: true, status: 200, json: async () => record }
  })
}

async function renderCasePage() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {await CasePage({ params: Promise.resolve({ id: "case-1" }) })}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  hoisted.apiServerFetch.mockReset()
})

describe("Hospital case detail patient reference", () => {
  it("shows only the masked identifier on the final readback page", async () => {
    const rawNumber = "HOSP-PRIVATE-001"
    mockApi({ record: caseRecord({ id: "patient-link-1", maskedIdentifier: "HO****01" }) })

    await renderCasePage()
    expect(screen.getByTestId("masked-patient-identifier").textContent).toBe("HO****01")
    expect(screen.queryByRole("button", { name: /correct/i })).toBeNull()
    expect(document.body.textContent).not.toContain(rawNumber)
  })
})

describe("Hospital case detail Central governance", () => {
  it("mounts the isolated control for the session the API grants it to", async () => {
    mockApi({ control: { status: 200, body: acceptedControl } })

    await renderCasePage()

    expect(screen.getByTestId("central-case-export-control").textContent).toBe("case-1:ACCEPTED")
  })

  it.each([403, 404])("mounts nothing when the API answers %i", async status => {
    mockApi({ control: { status } })

    await renderCasePage()

    // A clinician who created this case and handed it on is one of these: they
    // can still read the record, and hold no delivery authority over it.
    expect(screen.queryByTestId("central-case-export-control")).toBeNull()
  })

  it("mounts nothing when the granted state carries an unexpected field", async () => {
    mockApi({
      control: { status: 200, body: { ...acceptedControl, patientNumber: "SECRET" } },
    })

    await renderCasePage()

    expect(screen.queryByTestId("central-case-export-control")).toBeNull()
    expect(document.body.textContent).not.toContain("SECRET")
  })
})
