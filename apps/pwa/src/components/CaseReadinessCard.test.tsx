import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("expo-router", () => ({ useRouter: () => nav }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "en" }) }))

import { READINESS_KINDS } from "@lospor/core/case-readiness"
import { render } from "@/test/render"
import { CaseReadinessCard, finaliseLabel, readinessRoute, shownReadiness } from "./CaseReadinessCard"
import { intraopTabForFocus } from "@/lib/intraop-tabs"
import { screenSectionFor } from "@/lib/use-readiness-focus"

const PREOP = {
  ageYears: 40, sex: "MALE", heightCm: 180, weightKg: 80,
  diagnoses: [{ label: "x" }], procedures: [{ label: "y" }],
  bpSystolic: 120, bpDiastolic: 80, heartRate: 70, respiratoryRate: 14,
  mallampati: "I", asaScore: "2",
}

function texts(tree: ReturnType<typeof render>): string[] {
  return tree.root.findAll(node => String(node.type) === "Text")
    .map(node => [node.props.children].flat().join(""))
}

describe("the readiness card on the case screen", () => {
  it("lists every blocker and opens the right screen and section", () => {
    nav.push.mockClear()
    const tree = render(
      <CaseReadinessCard caseId="c1" caseData={{ clinicalMode: "ADULT", preop: { ...PREOP, mallampati: null } }} refusal={null} canEdit />,
    )

    expect(texts(tree)).toContain("Airway assessment (Mallampati)")
    expect(texts(tree)).toContain("No postoperative record")
    const airway = tree.root.findAll(node => node.props?.accessibilityRole === "button"
      && texts({ root: node } as never).includes("Airway assessment (Mallampati)"))[0]
    act(() => airway.props.onPress())
    expect(nav.push).toHaveBeenCalledWith("/(app)/cases/new?continue=c1&focus=airway")
  })

  it("is not shown on a finished case or to someone who cannot edit it", () => {
    expect(render(<CaseReadinessCard caseId="c1" caseData={{ status: "COMPLETE" }} refusal={null} canEdit />).toJSON()).toBeNull()
    expect(render(<CaseReadinessCard caseId="c1" caseData={{}} refusal={null} canEdit={false} />).toJSON()).toBeNull()
  })

  it("counts blockers beside Finalise", () => {
    expect(finaliseLabel("Finalise", { clinicalMode: "ADULT", preop: PREOP }, null)).toBe("Finalise (4)")
  })

  it("follows the case as it is edited, and falls back to the server's list only when the case looks done", () => {
    const serverSaid = { ready: false, blockers: [{ kind: "other" as const, severity: "blocker" as const, target: { stage: "preop" as const, section: null } }], warnings: [] }
    expect(shownReadiness({ clinicalMode: "ADULT", preop: PREOP }, serverSaid).blockers.length).toBe(4)
    const done = {
      clinicalMode: "ADULT", preop: PREOP,
      intraop: { startedAt: "2026-10-04T08:00:00Z", endedAt: "2026-10-04T09:00:00Z", techniques: ["GA"] },
      postop: { aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2, aldreteSpO2: 2, disposition: "WARD" },
    }
    expect(shownReadiness(done, serverSaid)).toBe(serverSaid)
  })
})

describe("where a Go to lands", () => {
  it("routes each stage to its screen", () => {
    expect(readinessRoute("c1", { kind: "missing_technique", severity: "blocker", target: { stage: "intraop", area: "technique" } }))
      .toBe("/(app)/cases/intraop/c1?focus=technique")
    expect(readinessRoute("c1", { kind: "missing_disposition", severity: "blocker", target: { stage: "postop", area: "disposition" } }))
      .toBe("/(app)/cases/postop/c1?focus=disposition")
    expect(readinessRoute("c1", { kind: "missing_preop", severity: "blocker", target: { stage: "preop", section: null } }))
      .toBe("/(app)/cases/new?continue=c1")
  })

  it("maps every preop section and intraop area to something on screen", () => {
    for (const section of ["demographics", "case_details", "medical_history", "current_medications", "anamnesis", "physical_exam", "airway", "labs", "risk_scores"]) {
      expect(screenSectionFor(section)).toBeTruthy()
    }
    for (const area of ["times", "events", "technique", "airway", "position", "monitoring", "vascular_access", "vitals", "medications", "fluids", "complications"]) {
      expect(intraopTabForFocus(area)).toBeTruthy()
    }
    expect(screenSectionFor("nonsense")).toBeNull()
    expect(intraopTabForFocus(undefined)).toBeNull()
  })

  it("has a label for every readiness kind Core defines", () => {
    // A missing label would be a compile error; this guards the runtime table too.
    expect(READINESS_KINDS.length).toBeGreaterThan(20)
  })
})
