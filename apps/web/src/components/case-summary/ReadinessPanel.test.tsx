// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { caseReadiness, READINESS_KINDS } from "@lospor/core/case-readiness"
import { READINESS_COPY } from "./readiness-labels"
import { ReadinessPanel, readinessHref } from "./ReadinessPanel"
import { ReviewBar } from "./ReviewBar"
import { LABELS } from "./labels"

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/usePendingCloseCountdown", () => ({ usePendingCloseCountdown: () => null }))

const PREOP = {
  ageYears: 40, sex: "MALE", heightCm: 180, weightKg: 80,
  diagnoses: [{ label: "x" }], procedures: [{ label: "y" }],
  bpSystolic: 120, bpDiastolic: 80, heartRate: 70, respiratoryRate: 14,
  mallampati: "I", asaScore: "2",
}

describe("every readiness kind has words in both languages", () => {
  it("leaves no line blank", () => {
    for (const locale of ["en", "bg"] as const) {
      for (const kind of READINESS_KINDS) expect(READINESS_COPY[locale][kind]).toBeTruthy()
    }
  })
})

describe("the readiness list", () => {
  it("shows every blocker, each with a way to it", () => {
    const readiness = caseReadiness({
      clinicalMode: "ADULT",
      preop: { ...PREOP, mallampati: null },
      intraop: null,
      postop: null,
    })
    render(<ReadinessPanel caseId="c1" readiness={readiness} locale="en" />)

    expect(screen.getByText("Airway assessment (Mallampati)")).toBeTruthy()
    expect(screen.getByText("The case has not been ended")).toBeTruthy()
    expect(screen.getByText("No postoperative record")).toBeTruthy()
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toContain(
      "/cases/new?continue=c1&step=0&focus=airway",
    )
  })

  it("points intraop and postop items at their step and part", () => {
    expect(readinessHref("c1", { kind: "missing_technique", severity: "blocker", target: { stage: "intraop", area: "technique" } }))
      .toBe("/cases/new?continue=c1&step=1&focus=technique")
    expect(readinessHref("c1", { kind: "missing_disposition", severity: "blocker", target: { stage: "postop", area: "disposition" } }))
      .toBe("/cases/new?continue=c1&step=2&focus=disposition")
    expect(readinessHref("c1", { kind: "missing_preop", severity: "blocker", target: { stage: "preop", section: null } }))
      .toBe("/cases/new?continue=c1&step=0")
  })

  it("renders nothing when nothing is left", () => {
    const { container } = render(
      <ReadinessPanel caseId="c1" readiness={{ ready: true, blockers: [], warnings: [] }} locale="en" />,
    )
    expect(container.textContent).toBe("")
  })
})

describe("the review bar", () => {
  afterEach(() => vi.unstubAllGlobals())

  const COMPLETE = {
    clinicalMode: "ADULT", preop: PREOP,
    intraop: {
      startedAt: "2026-10-04T08:00:00Z", endedAt: "2026-10-04T09:00:00Z", techniques: ["GA"],
      airwayDevices: ["ETT"], positions: ["SUPINE"], ecg: true, vascularAccesses: ["PIV"],
      vitals: [{ hr: 70 }], drugs: [{ drugId: "propofol" }], fluids: [{ type: "RL" }], complications: "None",
    },
    postop: {
      aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2,
      aldreteSpO2: 2, disposition: "WARD",
    },
  }
  const bar = (readinessCase: Record<string, unknown> = { clinicalMode: "ADULT", preop: PREOP, intraop: null, postop: null }) =>
    render(
      <ReviewBar
        caseId="c1" status="IN_PROGRESS" canWrite awaitingReviewAt={null} finalizedAtMs={null}
        now={0} labels={LABELS.en} readinessCase={readinessCase}
        onFinalized={() => {}} onUnfinalized={() => {}}
      />,
    )

  it("counts the blockers beside the finalize button", () => {
    bar()
    expect(screen.getByRole("button", { name: `${LABELS.en.closeNow} (4)` })).toBeTruthy()
  })

  it("lists the server's blockers after a refusal instead of an alert", async () => {
    const alert = vi.fn()
    vi.stubGlobal("alert", alert)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "x", reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.labs"] }],
    }), { status: 422 })))
    bar(COMPLETE)

    fireEvent.click(screen.getByRole("button", { name: LABELS.en.closeNow }))

    await waitFor(() => expect(screen.getByText("Laboratory results")).toBeTruthy())
    expect(alert).not.toHaveBeenCalled()
  })

  it("still explains a refusal that carries no list", async () => {
    const alert = vi.fn()
    vi.stubGlobal("alert", alert)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "CASE_ALREADY_FINALIZED" }), { status: 409 })))
    bar(COMPLETE)

    fireEvent.click(screen.getByRole("button", { name: LABELS.en.closeNow }))

    await waitFor(() => expect(alert).toHaveBeenCalled())
  })
})
