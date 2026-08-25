// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BlockedSaveIssue } from "@lospor/core/sync"
import { schema as preopFormSchema, type PreopData } from "@/components/forms/preopSchema"
import type { CaseDetail } from "@/types/case-detail"
import NewCasePage from "./page"

// ── Test doubles ─────────────────────────────────────────────────────────────
// Everything below the page is stubbed. What is under test is the page's own
// wiring: what it hands a form when a draft is reopened, what it hands the
// autosave manager when that form saves, and when it is allowed to move on.

const hoisted = vi.hoisted(() => {
  const router = { replace: vi.fn(), push: vi.fn() }
  const autosave = {
    outbox: { load: vi.fn(async () => null) },
    pendingEvents: { loadPending: vi.fn(async () => [] as unknown[]) },
    eventMutations: { load: vi.fn(async () => [] as unknown[]) },
    hydrateSection: vi.fn(),
    saveSection: vi.fn(async (
      _caseId: string,
      _section: string,
      _payload: Record<string, unknown>,
      _options?: unknown,
    ): Promise<Record<string, unknown>> => ({ result: "saved" })),
    runExclusive: vi.fn(async (_key: string, fn: () => unknown) => fn()),
    getRevision: vi.fn(() => null),
    stageEventMutation: vi.fn(async () => {}),
    appendEvent: vi.fn(async () => {}),
    flushCase: vi.fn(async () => {}),
    waitForCase: vi.fn(async () => {}),
    getState: vi.fn(() => ({ pending: 0 })),
  }
  const captured: {
    preop: { defaultValues?: PreopData; onAutoSave?: (d: PreopData) => void } | null
    postop: { onSubmit?: (d: Record<string, unknown>) => void } | null
  } = { preop: null, postop: null }
  return {
    router,
    autosave,
    captured,
    searchParams: new URLSearchParams(),
    translate: (key: string) => key,
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => hoisted.router,
  useSearchParams: () => hoisted.searchParams,
}))
vi.mock("next-intl", () => ({ useTranslations: () => hoisted.translate }))
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))
vi.mock("@/lib/autosave-manager", () => ({ autosaveManager: hoisted.autosave }))
vi.mock("@/lib/case-outbox", () => ({ onOutboxChange: () => () => {} }))
vi.mock("@/context/TourContext", () => ({ useTour: () => ({ setCurrentFormStep: () => {} }) }))
vi.mock("@/hooks/useCaseLock", () => ({
  useCaseLock: () => ({ isWatching: false, holderName: null, takeover: () => {} }),
}))
vi.mock("@/components/CaseMeta", () => ({ CaseMeta: () => null }))
vi.mock("@/components/WatchingBanner", () => ({ WatchingBanner: () => null }))
vi.mock("@/components/CaseSummary", () => ({ CaseSummary: () => <div data-testid="case-summary" /> }))
vi.mock("@/components/forms/PreopForm", () => ({
  PreopForm: (props: { defaultValues?: PreopData; onAutoSave?: (d: PreopData) => void }) => {
    hoisted.captured.preop = props
    return <div data-testid="preop-form" />
  },
}))
vi.mock("@/components/forms/IntraopForm", () => ({
  IntraopForm: () => <div data-testid="intraop-form" />,
}))
vi.mock("@/components/forms/PostopForm", () => ({
  PostopForm: (props: { onSubmit?: (d: Record<string, unknown>) => void }) => {
    hoisted.captured.postop = props
    return <div data-testid="postop-form" />
  },
}))

// ── Case fixtures ────────────────────────────────────────────────────────────

function baseRecord(overrides: Partial<CaseDetail> = {}): CaseDetail {
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
    institution: null,
    preop: null,
    intraop: null,
    postop: null,
    capabilities: { canRead: true, canWrite: true, isCreator: true, isAssignee: true },
    ...overrides,
  }
}

function stubFetch(record: CaseDetail) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => record,
  })))
}

async function openDraft(record: CaseDetail, params: Record<string, string>) {
  hoisted.searchParams = new URLSearchParams({ continue: "case-1", ...params })
  stubFetch(record)
  render(<NewCasePage />)
  await waitFor(() => expect(screen.queryByText("case.loadingDraft")).toBeNull())
}

// ── The preop field matrix ───────────────────────────────────────────────────
//
// One row per field the preop form can edit. `db` is what the API hands back
// for a saved case; `form` is what the form must be given when that case is
// reopened; the same value must then reach the server again on the next save.
//
// The list is generated from the preop form schema, not hand-maintained: add a
// field to `preopSchema.ts` without adding a row here and the coverage test
// below fails. That is the point of this file — the fields that were being
// dropped (`elective`, `aiOptIn`, the score inputs, the "unable to obtain"
// flags, `physicalExamReport`, `notes`) were all editable, all persisted, and
// all invisible to a green test suite.
//
// A field may only be listed as never-persisted with a reason.
const NEVER_PERSISTED: Record<string, string> = {
  patientFirstName: "GDPR: identity is printed by hand, never stored",
  patientLastName:  "GDPR: identity is printed by hand, never stored",
  patientId:        "GDPR: identity is printed by hand, never stored",
}

type RoundTrip = {
  /** Columns on the stored preop record. */
  db?: Record<string, unknown>
  /** Fields carried on the case record rather than the preop record. */
  record?: Partial<CaseDetail>
  /** The value the form must receive, and hand back on the next save. */
  form: unknown
}

const FASTING_ROW = {
  category: "CLEAR_FLUIDS",
  lastIntakeAt: "2026-08-01T04:00:00.000Z",
  status: "MET",
  requiredHours: 2,
  policyId: "esaic-2022",
  policyVersion: "1",
}

// Every field carries a distinct value so a mis-wired mapping cannot pass by
// coincidence, and every boolean is `true` so a dropped one reads back false.
// Clinical coherence is deliberately not the point: this is one synthetic
// record that exercises every column at once.

/** Fields stored and restored under the same name, unchanged. */
function rows(spec: Record<string, unknown>): Record<string, RoundTrip> {
  return Object.fromEntries(
    Object.entries(spec).map(([field, value]) => [field, { db: { [field]: value }, form: value }]),
  )
}
const flags = (...fields: string[]) =>
  rows(Object.fromEntries(fields.map(field => [field, true])))

const MATRIX: Record<string, RoundTrip> = {
  clinicalMode: { record: { clinicalMode: "PEDIATRIC" }, form: "PEDIATRIC" },

  // ageYears is 0 on purpose — a neonate is 0 years old.
  ...rows({
    ageYears: 0, ageValue: 9, ageUnit: "MONTHS", sex: "FEMALE",
    heightCm: 71.5, weightKg: 8.4, bloodType: "AB", rhFactor: "NEGATIVE",
    teamNotes: "Two surgeons scrubbed",
    comorbidities: [{ label: "Asthma" }],
    familyAnesthesiaDetails: "Aunt — suspected MH",
    rcriScore: 3, apfelScore: 2, stopBangScore: 5,
    coldsCurrentSymptoms: "MILD", coldsOnset: "TWO_TO_4_WEEKS",
    coldsLungDisease: "MODERATE_OR_SEVERE", coldsAirwayDevice: "SUPRAGLOTTIC",
    coldsSurgery: "MINOR_AIRWAY", pediatricFasting: [FASTING_ROW],
    bpSystolic: 96, bpDiastolic: 54, heartRate: 128, spO2: 97,
    temperature: 36.8, respiratoryRate: 24,
    mallampati: "III", mouthOpeningCm: 2.5, thyromental: 5.5,
    neckMobility: "LIMITED", upperLipBiteTest: "CLASS_II",
    difficultAirwayNotes: "Grade III at last GA", cormackLehane: "IIb",
    asaScore: "III",
    physicalExamReport: "Chest clear, no added sounds",
    notes: "Parents consented in writing",
    labResults: [{ test: "Hb", value: "11.2", unit: "g/dL" }],
  }),

  ...flags(
    "highRiskSurgery", "elective", "emergencySurgery", "aiOptIn",
    "allergies", "latexAllergy", "familyAnesthesiaProblems",
    "dentalProsthetics", "looseTeeth", "smoking", "substanceAbuse",
    // Score inputs — the boxes the clinician ticked, not the derived totals
    "apfelPONVHistory", "apfelPostopOpioids",
    "stopbangSnoring", "stopbangTired", "stopbangObserved", "stopbangBP", "stopbangNeck",
    "rcriIschemicHeart", "rcriCHF", "rcriCVD", "rcriInsulinDM", "rcriCreatinine",
    "povocSurgeryAtLeast30Minutes", "povocStrabismusSurgery", "povocHistory",
    "coldsApplicable", "heartArrhythmia",
    "retrognathia", "prominentIncisors", "facialHair", "difficultAirwayHistory",
    // "Unable to obtain" — a recorded refusal to record
    "bpUnobtainable", "heartRateUnobtainable", "spO2Unobtainable",
    "temperatureUnobtainable", "respiratoryRateUnobtainable", "airwayUnobtainable",
  ),

  // Renamed or reshaped between the record and the form
  diagnoses: {
    db: { diagnosesJson: [{ label: "Acute appendicitis" }], diagnosis: "Acute appendicitis" },
    form: [{ label: "Acute appendicitis" }],
  },
  procedures: {
    db: { proceduresJson: [{ label: "Appendectomy" }], plannedProcedure: "Appendectomy" },
    form: [{ label: "Appendectomy" }],
  },
  allergyDetails: {
    db: { allergyDetails: JSON.stringify([{ label: "Penicillin" }]) },
    form: [{ label: "Penicillin" }],
  },
  currentMedications: {
    db: { currentMedications: JSON.stringify([{ label: "Salbutamol" }]) },
    form: [{ label: "Salbutamol" }],
  },
}

function matrixRecord(): CaseDetail {
  const preop: Record<string, unknown> = {
    id: "preop-1",
    caseId: "case-1",
    updatedAt: "2026-08-01T06:00:00.000Z",
    syncRevision: 4,
  }
  let record = baseRecord()
  for (const entry of Object.values(MATRIX)) {
    Object.assign(preop, entry.db ?? {})
    record = { ...record, ...(entry.record ?? {}) }
  }
  return { ...record, preop: preop as unknown as CaseDetail["preop"] }
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  hoisted.captured.preop = null
  hoisted.captured.postop = null
  hoisted.autosave.saveSection.mockResolvedValue({ result: "saved" })
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("reopening a draft — preop field matrix", () => {
  it("has a row for every field the preop form can edit", () => {
    const uncovered = Object.keys(preopFormSchema.shape).filter(
      field => !(field in MATRIX) && !(field in NEVER_PERSISTED),
    )
    expect(uncovered).toEqual([])
  })

  it("does not claim a field is unpersisted without a reason", () => {
    for (const [field, reason] of Object.entries(NEVER_PERSISTED)) {
      expect(reason, `${field} needs a stated reason`).toBeTruthy()
      expect(field in preopFormSchema.shape).toBe(true)
    }
  })

  it("gives the form back every field that was saved", async () => {
    await openDraft(matrixRecord(), {})

    const defaults = hoisted.captured.preop?.defaultValues as Record<string, unknown>
    expect(defaults).toBeTruthy()

    const lost: string[] = []
    for (const [field, entry] of Object.entries(MATRIX)) {
      try {
        expect(defaults[field]).toEqual(entry.form)
      } catch {
        lost.push(`${field}: expected ${JSON.stringify(entry.form)}, got ${JSON.stringify(defaults[field])}`)
      }
    }
    expect(lost).toEqual([])
  })

  it("sends every restored field back to the server on the next save", async () => {
    await openDraft(matrixRecord(), {})

    const defaults = hoisted.captured.preop?.defaultValues as PreopData
    await act(async () => { hoisted.captured.preop?.onAutoSave?.(defaults) })

    await waitFor(() => expect(hoisted.autosave.saveSection).toHaveBeenCalled())
    const payload = hoisted.autosave.saveSection.mock.calls.at(-1)?.[2] ?? {}

    const dropped: string[] = []
    for (const [field, entry] of Object.entries(MATRIX)) {
      try {
        expect(payload[field]).toEqual(entry.form)
      } catch {
        dropped.push(`${field}: expected ${JSON.stringify(entry.form)}, got ${JSON.stringify(payload[field])}`)
      }
    }
    expect(dropped).toEqual([])
  })

  it("never restores the identity fields that are not stored", async () => {
    await openDraft(matrixRecord(), {})

    const defaults = hoisted.captured.preop?.defaultValues as Record<string, unknown>
    for (const field of Object.keys(NEVER_PERSISTED)) {
      expect(defaults[field]).toBeUndefined()
    }
  })
})

describe("step parameter", () => {
  const withPreop = () => baseRecord({
    preop: { id: "preop-1", caseId: "case-1" } as unknown as CaseDetail["preop"],
  })

  it("falls back to the derived step when ?step is not a number", async () => {
    await openDraft(withPreop(), { step: "abc" })
    expect(screen.getByTestId("preop-form")).toBeTruthy()
  })

  it("falls back to the derived step when ?step is empty", async () => {
    await openDraft(withPreop(), { step: "" })
    expect(screen.getByTestId("preop-form")).toBeTruthy()
  })

  it("honours a valid ?step", async () => {
    await openDraft(withPreop(), { step: "2" })
    expect(screen.getByTestId("postop-form")).toBeTruthy()
  })

  it("clamps a step above the last one", async () => {
    await openDraft(withPreop(), { step: "9" })
    expect(screen.getByTestId("case-summary")).toBeTruthy()
  })

  it("clamps a negative step", async () => {
    await openDraft(withPreop(), { step: "-4" })
    expect(screen.getByTestId("preop-form")).toBeTruthy()
  })
})

describe("a blocked postop save", () => {
  const blocked: BlockedSaveIssue = {
    code: "PII_BLOCKED",
    field: "dispositionNotes",
    reason: "likely_name",
    message: "Looks like a patient name",
    retryable: false,
    blockedKeys: ["dispositionNotes"],
  }

  async function submitPostop(outcome: Record<string, unknown>) {
    hoisted.autosave.saveSection.mockResolvedValue(outcome)
    await openDraft(
      baseRecord({
        preop:  { id: "preop-1", caseId: "case-1" } as unknown as CaseDetail["preop"],
        postop: { id: "postop-1", caseId: "case-1" } as unknown as CaseDetail["postop"],
      }),
      { step: "2" },
    )
    await act(async () => {
      hoisted.captured.postop?.onSubmit?.({ disposition: "WARD", dispositionNotes: "Ivan Petrov" })
    })
  }

  it("does not advance to the summary", async () => {
    await submitPostop({ result: "blocked", blocked })

    // Nothing was stored, so the clinician must stay on the form that holds it.
    expect(screen.getByTestId("postop-form")).toBeTruthy()
    expect(screen.queryByTestId("case-summary")).toBeNull()
  })

  it("does not start the countdown that finalises the case", async () => {
    await submitPostop({ result: "blocked", blocked })

    expect(localStorage.getItem("summaryOpenedAt_case-1")).toBeNull()
  })

  it("still advances when the save is accepted", async () => {
    await submitPostop({ result: "saved" })

    expect(screen.getByTestId("case-summary")).toBeTruthy()
    expect(localStorage.getItem("summaryOpenedAt_case-1")).not.toBeNull()
  })
})
