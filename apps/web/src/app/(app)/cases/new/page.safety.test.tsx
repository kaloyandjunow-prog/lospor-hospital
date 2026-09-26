// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PreopData } from "@/components/forms/preopSchema"
import NewCasePage from "./page"

const hoisted = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn() },
  translate: (key: string) => key,
  searchParams: new URLSearchParams(),
  captured: { preop: null as null | {
    defaultValues?: PreopData
    onSubmit?: (data: PreopData) => void | Promise<void>
    onClinicalInput?: () => void
    rejectedFields?: Map<string, string>
    submitError?: string | null
  } },
  autosave: {
    outbox: { load: vi.fn(async () => null) },
    pendingEvents: { loadPending: vi.fn(async () => []) },
    eventMutations: { load: vi.fn(async () => []) },
    hydrateSection: vi.fn(),
    saveSection: vi.fn(async () => ({ result: "saved" })),
    runExclusive: vi.fn(async (_key: string, fn: () => unknown) => fn()),
    getRevision: vi.fn(() => null),
    stageEventMutation: vi.fn(),
    appendEvent: vi.fn(),
    flushCase: vi.fn(),
    waitForCase: vi.fn(),
    getState: vi.fn(() => ({ pending: 0 })),
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => hoisted.router,
  useSearchParams: () => hoisted.searchParams,
}))
vi.mock("next-intl", () => ({
  useTranslations: () => hoisted.translate,
  useLocale: () => "en",
}))
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))
vi.mock("@/lib/autosave-manager", () => ({ autosaveManager: hoisted.autosave, onEventRefused: () => () => {} }))
vi.mock("@/lib/case-outbox", () => ({ onOutboxChange: () => () => {} }))
vi.mock("@/context/TourContext", () => ({ useTour: () => ({ setCurrentFormStep: () => {} }) }))
vi.mock("@/hooks/useCaseLock", () => ({
  useCaseLock: () => ({ isWatching: false, holderName: null, takeover: () => {} }),
}))
vi.mock("@/components/CaseMeta", () => ({ CaseMeta: () => null }))
vi.mock("@/components/WatchingBanner", () => ({ WatchingBanner: () => null }))
vi.mock("@/components/CaseSummary", () => ({ CaseSummary: () => <div data-testid="case-summary" /> }))
vi.mock("@/components/forms/PreopForm", () => ({
  PreopForm: (props: typeof hoisted.captured.preop) => {
    hoisted.captured.preop = props
    return <div data-testid="preop-form">{props?.submitError ? <p role="alert">{props.submitError}</p> : null}</div>
  },
}))
vi.mock("@/components/forms/IntraopForm", () => ({ IntraopForm: () => <div data-testid="intraop-form" /> }))
vi.mock("@/components/forms/PostopForm", () => ({ PostopForm: () => <div data-testid="postop-form" /> }))

const DATA = {
  patientId: "HOSP-000123", clinicalMode: "ADULT", ageYears: 47, sex: "FEMALE",
  heightCm: 166, weightKg: 69, diagnoses: [{ label: "Acute appendicitis" }],
  procedures: [{ label: "Appendectomy" }], teamNotes: "Routine list",
  comorbidities: [], allergyDetails: [], currentMedications: [], pediatricFasting: [], labResults: [],
} as unknown as PreopData

const reply = (status: number, body: Record<string, unknown>) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})
const created = (overrides: Record<string, unknown> = {}) => reply(201, {
  id: "case-created",
  caseCode: "AA-0001",
  patientReference: { id: "patient-link-1", maskedIdentifier: "HO****23" },
  preopRevision: 1,
  ...overrides,
})

async function submitPreop(data = DATA) {
  render(<NewCasePage />)
  act(() => hoisted.captured.preop?.onClinicalInput?.())
  await act(async () => { await hoisted.captured.preop?.onSubmit?.(data) })
}

beforeEach(() => {
  hoisted.captured.preop = null
  hoisted.searchParams = new URLSearchParams()
  hoisted.autosave.saveSection.mockResolvedValue({ result: "saved" })
  vi.stubGlobal("scrollTo", vi.fn())
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("preop navigation save gate", () => {
  it("preserves the form and stays on preop after a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Hospital server unreachable")))
    await submitPreop()
    expect(screen.getByTestId("preop-form")).toBeTruthy()
    expect(screen.queryByTestId("intraop-form")).toBeNull()
    expect(screen.getByRole("alert").textContent).toBe("Hospital server unreachable")
    expect(hoisted.captured.preop?.defaultValues).toMatchObject(DATA)
  })

  it("stays on preop when the API rejects request validation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(400, { error: "Invalid clinical mode" })))
    await submitPreop()
    expect(screen.getByTestId("preop-form")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toBe("Invalid clinical mode")
  })

  it("keeps PII-blocked input on its field and does not route to the partial case", async () => {
    const piiData = { ...DATA, teamNotes: "Patient Ivan Petrov" }
    const saves = vi.fn()
      .mockResolvedValueOnce(reply(400, {
        code: "PII_BLOCKED", field: "teamNotes", reason: "likely_name",
        error: "Identifying information is not allowed", retryable: false, blockedKeys: ["teamNotes"],
      }))
      .mockResolvedValueOnce(created())
    // A new case reads the preop profile on its own; that read is not a save.
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === "/api/preop/profile" ? reply(404, {}) : saves()))
    await submitPreop(piiData)
    expect(screen.getByTestId("preop-form")).toBeTruthy()
    expect(hoisted.captured.preop?.defaultValues?.teamNotes).toBe("Patient Ivan Petrov")
    await waitFor(() => expect(hoisted.captured.preop?.rejectedFields?.has("teamNotes")).toBe(true))
    expect(hoisted.router.replace).not.toHaveBeenCalledWith(expect.stringContaining("continue=case-created"), expect.anything())
  })

  it("guards partial rejected data from reload, then clears the guard after correction saves", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => created({
      rejectedFields: [{ path: "preop.heightCm", message: "out of range" }],
    })))
    await submitPreop()
    expect(screen.getByRole("alert").textContent).toBe("case.correctRejectedFields")
    expect(hoisted.captured.preop?.rejectedFields?.has("heightCm")).toBe(true)
    expect(hoisted.router.replace).not.toHaveBeenCalledWith(expect.stringContaining("continue=case-created"), expect.anything())
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false)

    await act(async () => { await hoisted.captured.preop?.onSubmit?.({ ...DATA, heightCm: 165 }) })
    expect(screen.getByTestId("intraop-form")).toBeTruthy()
    await waitFor(() => expect(hoisted.router.replace).toHaveBeenCalledWith(
      "/cases/new?continue=case-created&step=1", { scroll: false },
    ))
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true)
  })

  it("advances only after the server accepts the complete preop save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => created()))
    await submitPreop()
    expect(screen.getByTestId("intraop-form")).toBeTruthy()
    expect(screen.queryByTestId("preop-form")).toBeNull()
  })

  it("stays on preop while a required profile question is unanswered", async () => {
    // Drafts always save; required questions hold back continue-to-intraop,
    // which the case read reports after the preop reached the server.
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => !init?.method
      ? reply(200, { preopRequiredMissing: [{ stableKey: "BASE_SMOKING", labelEn: "Smoking", labelBg: "Тютюнопушене", fields: ["smoking"] }] })
      : created()))
    await submitPreop()
    expect(screen.getByTestId("preop-form")).toBeTruthy()
    expect(screen.queryByTestId("intraop-form")).toBeNull()
  })
})

describe("hospital patient reference", () => {
  it("loads only the masked value and relinks after matching confirmation", async () => {
    hoisted.searchParams = new URLSearchParams({ continue: "case-1" })
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, {
      id: "case-1", caseCode: "AB-1234", status: "IN_PROGRESS", clinicalMode: "ADULT",
      preop: null, intraop: null, postop: null,
      patientReference: { id: "patient-link-1", maskedIdentifier: "OL****23" },
    })))
    render(<NewCasePage />)
    await waitFor(() => expect(screen.getByTestId("masked-patient-identifier").textContent).toBe("OL****23"))
    const patchFetch = vi.fn(async () => created({
      patientReference: { id: "patient-link-2", maskedIdentifier: "NE****99" },
    }))
    vi.stubGlobal("fetch", patchFetch)
    fireEvent.click(screen.getByRole("button", { name: "correct" }))
    fireEvent.change(screen.getByLabelText("newNumber"), { target: { value: "NEW-00099" } })
    fireEvent.change(screen.getByLabelText("repeatNumber"), { target: { value: "NEW-00099" } })
    fireEvent.click(screen.getByRole("button", { name: "review" }))
    expect(patchFetch).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("reason"), { target: { value: "admitted under the wrong number" } })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "confirm" })) })
    // Correcting the patient is its own endpoint now, and carries what the
    // caller believed the link was plus why it is being changed.
    expect(patchFetch).toHaveBeenCalledWith("/api/cases/case-1/patient-link/correct", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        expectedPatientLinkId: "patient-link-1",
        newPatientNumber: "NEW-00099",
        correctionReason: "admitted under the wrong number",
      }),
    }))
    expect(screen.getByTestId("masked-patient-identifier").textContent).toBe("NE****99")
    expect(document.body.textContent).not.toContain("NEW-00099")
  })
})
