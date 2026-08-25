// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import ClinicalRulesPage from "./page"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))
vi.mock("@/components/clinical-rules/ClinicalRuleEditor", () => ({
  ClinicalRuleEditor: () => <div>Clinical rule editor</div>,
}))
vi.mock("@/components/clinical-rules/AdultClinicalRuleEditor", () => ({
  AdultClinicalRuleEditor: () => <div>Adult rule editor</div>,
}))
vi.mock("@/components/clinical-rules/PediatricDrugProfileSetEditor", () => ({
  PediatricDrugProfileSetEditor: () => <div>Pediatric rule editor</div>,
}))

const institution = { id: "institution-1", name: "Test Hospital", city: "Sofia" }
const publishedPreset = {
  id: "preset-published",
  key: "LOSPOR_ADULTS",
  version: 1,
  name: "LOSPORADULTS Rules",
  description: null,
  clinicalMode: "ADULT",
  scope: "PLATFORM",
  ownerInstitutionId: null,
  ownerInstitutionName: null,
  ownerUserId: null,
  ownerUserName: null,
  copiedFromPresetId: null,
  copiedFromVersion: null,
  status: "PUBLISHED",
  rules: [],
  assignedInstitutionCount: 0,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
  publishedAt: "2026-07-31T00:00:00.000Z",
}
const rule = {
  id: "rule-1",
  ruleKey: "ADULT_DRUG_PROFILE:PROPOFOL",
  ruleVersion: "HOSPITAL.v1",
  payload: {
    kind: "ADULT_DRUG_PROFILE",
    itemKey: "PROPOFOL",
    labelEn: "Propofol",
    profile: { routes: ["IV"], routeModes: { IV: { min: 0, max: 300 } } },
    unit: null,
    routeUnits: {},
  },
  sourceRefs: [],
}
const institutionDraft = {
  ...publishedPreset,
  id: "institution-draft",
  version: 2,
  name: "Adult draft",
  key: "HOSPITAL_ADULTS",
  status: "DRAFT",
  publishedAt: null,
  scope: "INSTITUTION",
  ownerInstitutionId: institution.id,
  ownerInstitutionName: institution.name,
  copiedFromPresetId: publishedPreset.id,
  rules: [rule],
}
const hodWorkbench = {
  clinicalMode: "ADULT",
  actor: {
    id: "hod-1",
    role: "HEAD_OF_DEPT",
    institutionId: institution.id,
    institutionName: institution.name,
  },
  management: {
    activeScope: "INSTITUTION",
    defaultScope: "INSTITUTION",
    allowedScopes: ["INSTITUTION", "USER"],
    ownerInstitutionId: institution.id,
    ownerInstitutionName: institution.name,
  },
  institutions: [institution],
  presets: [institutionDraft, publishedPreset],
  selections: [{
    clinicalMode: "ADULT",
    platformPresetId: publishedPreset.id,
    institutionPresetId: null,
    userPresetId: null,
    effectivePresetId: publishedPreset.id,
    effectivePresetName: publishedPreset.name,
    effectiveScope: "PLATFORM",
    effectiveVersion: 1,
  }],
  effectiveRules: [],
  overrides: [],
  reviewers: [],
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

afterEach(() => vi.restoreAllMocks())

describe("institution clinical-rules confirmation", () => {
  it("requires HOD re-authentication and a reason before publishing shared rules", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith("/api/library/")) return response([])
      if (url.startsWith("/api/clinical/rules/workbench") && init?.method === "POST") {
        return response({ ...institutionDraft, status: "PUBLISHED" })
      }
      if (url.startsWith("/api/clinical/rules/workbench")) return response(hodWorkbench)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ClinicalRulesPage />)

    await screen.findByText("Available rulesets")
    fireEvent.click(screen.getByRole("button", { name: /Adult draft v2/ }))
    fireEvent.click(screen.getByRole("button", { name: "Publish" }))
    expect(screen.getByRole("dialog", { name: "Confirm institution publication" })).toBeTruthy()
    expect(screen.getAllByText("Exact ruleset difference")).toHaveLength(2)
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "Password!1" } })
    fireEvent.change(screen.getByLabelText(/Clinical reason/), {
      target: { value: "Approved department dosing policy change." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/clinical/rules/workbench",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"confirmation":{"password":"Password!1","reason":"Approved department dosing policy change."}'),
      }),
    ))
  })
})
