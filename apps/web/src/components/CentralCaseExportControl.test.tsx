// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, describe, expect, it, vi } from "vitest"
import bgMessages from "../../messages/bg.json"
import enMessages from "../../messages/en.json"
import { CentralCaseExportControl } from "./CentralCaseExportControl"
import type { CentralCaseExportControl as CentralControl } from "@/lib/central-case-export-control"

function controlFixture(overrides: Partial<CentralControl> = {}): CentralControl {
  return {
    schemaVersion: 2,
    state: "ACCEPTED",
    decidedAt: "2026-08-23T08:15:00.000Z",
    lastBatch: {
      status: "ACCEPTED",
      action: "UPSERT",
      acceptedAt: "2026-08-23T08:20:00.000Z",
      errorCode: "CENTRAL_REJECTED",
    },
    canWithdraw: true,
    canResend: false,
    ...overrides,
  }
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function renderControl(locale: "en" | "bg" = "en", caseId = "case-1") {
  const messages = locale === "bg" ? bgMessages : enMessages
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CentralCaseExportControl caseId={caseId} />
    </NextIntlClientProvider>,
  )
}

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => (
    leafPaths(child, prefix ? `${prefix}.${key}` : key)
  )).sort()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("CentralCaseExportControl", () => {
  it("keeps every English and Bulgarian panel message aligned", () => {
    expect(leafPaths(bgMessages.centralExport)).toEqual(leafPaths(enMessages.centralExport))
    expect(leafPaths(bgMessages.centralDeliveryList)).toEqual(leafPaths(enMessages.centralDeliveryList))
  })

  it("renders only bounded governance and delivery information", async () => {
    const fetchMock = vi.fn(async () => response(controlFixture()))
    vi.stubGlobal("fetch", fetchMock)

    renderControl()

    expect(await screen.findByText("Accepted by Central")).toBeTruthy()
    expect(screen.getByText("Accepted")).toBeTruthy()
    expect(screen.getByText(/coded error/i)).toBeTruthy()
    expect(document.body.textContent).not.toContain("CENTRAL_REJECTED")
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/hospital/cases/case-1/export-control",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
    )
  })

  it("uses a strictly parsed server-supplied state without an initial duplicate request", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <CentralCaseExportControl caseId="transferred-case" initialControl={controlFixture()} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText("Accepted by Central")).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("renders the complete panel copy in Bulgarian", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(controlFixture())))

    renderControl("bg")

    expect(await screen.findByText("Приет от Central")).toBeTruthy()
    expect(screen.getByText("Управление на изпращането")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Поискай оттегляне" })).toBeTruthy()
  })

  it("requires an explicit confirmation and sends no optional free text for withdrawal", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return response(controlFixture({
          state: "WITHDRAWAL_PENDING",
          canWithdraw: false,
        }))
      }
      return response(controlFixture())
    })
    vi.stubGlobal("fetch", fetchMock)

    renderControl("en", "case/with space")
    fireEvent.click(await screen.findByRole("button", { name: "Request withdrawal" }))

    expect(screen.getByRole("heading", { name: "Withdraw this case from Central?" })).toBeTruthy()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Confirm withdrawal" }))

    expect(await screen.findByText("The Central delivery choice was updated.")).toBeTruthy()
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")
    expect(putCall?.[0]).toBe("/api/hospital/cases/case%2Fwith%20space/export-control")
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ action: "WITHDRAW" })
  })

  it("requires confirmation before making a withdrawn case eligible again", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return response(controlFixture({ state: "QUEUED", canWithdraw: false, canResend: false }))
      }
      return response(controlFixture({
        state: "WITHDRAWN",
        canWithdraw: false,
        canResend: true,
        lastBatch: { ...controlFixture().lastBatch!, action: "WITHDRAW" },
      }))
    })
    vi.stubGlobal("fetch", fetchMock)

    renderControl()
    fireEvent.click(await screen.findByRole("button", { name: "Send again" }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Confirm resend" }))

    await screen.findByText("The Central delivery choice was updated.")
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ action: "RESEND" })
  })

  it.each([
    ["403", () => response({ error: "Forbidden" }, 403)],
    ["404", () => response({ error: "Not found" }, 404)],
    ["malformed data", () => response({
      ...controlFixture(),
      patientIdentifier: "HOSP-PRIVATE-001",
      casePseudonym: "central-pseudonym-1",
      auditDetail: "operator free text",
      lastBatch: { ...controlFixture().lastBatch as object, batchId: "raw-batch-id-1" },
    })],
  ])("fails closed when an already-open panel receives %s", async (_label, changedResponse) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(controlFixture()))
      .mockImplementation(async () => changedResponse())
    vi.stubGlobal("fetch", fetchMock)

    renderControl()
    expect(await screen.findByRole("button", { name: "Request withdrawal" })).toBeTruthy()

    window.dispatchEvent(new Event("focus"))

    expect(await screen.findByRole("alert")).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole("button", { name: "Request withdrawal" })).toBeNull())
    expect(document.body.textContent).not.toContain("HOSP-PRIVATE-001")
    expect(document.body.textContent).not.toContain("central-pseudonym-1")
    expect(document.body.textContent).not.toContain("raw-batch-id-1")
    expect(document.body.textContent).not.toContain("operator free text")
  })
})
