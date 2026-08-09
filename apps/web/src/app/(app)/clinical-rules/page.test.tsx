// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import ClinicalRulesPage from "./page"

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}))

vi.mock("@/components/clinical-rules/ClinicalRuleEditor", () => ({
  ClinicalRuleEditor: ({
    initial,
    fluidOptions,
  }: {
    initial?: { kind?: string; itemKey?: string } | null
    fluidOptions?: unknown[]
  }) => (
    <div data-testid="clinical-rule-editor">
      {initial?.kind ?? "new"} · {initial?.itemKey ?? ""} · fluids:{fluidOptions?.length ?? 0}
    </div>
  ),
}))

vi.mock("@/components/clinical-rules/AdultClinicalRuleEditor", () => ({
  AdultClinicalRuleEditor: () => <div data-testid="adult-clinical-rule-editor">Adult rule editor</div>,
}))

vi.mock("@/components/clinical-rules/PediatricDrugProfileSetEditor", () => ({
  PediatricDrugProfileSetEditor: () => (
    <div data-testid="pediatric-drug-profile-editor">Pediatric drug profile editor</div>
  ),
}))

const institution = {
  id: "institution-1",
  name: "Test Hospital",
  city: "Sofia",
}

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

const draftPreset = {
  ...publishedPreset,
  id: "preset-draft",
  version: 2,
  name: "Adult draft",
  key: "LOSPOR_ADULTS_COPY",
  status: "DRAFT",
  publishedAt: null,
}

function workbench(includeDraft: boolean, draftRules: unknown[] = []) {
  const draft = { ...draftPreset, rules: draftRules }
  return {
    clinicalMode: "ADULT",
    actor: {
      id: "admin-1",
      role: "ADMIN",
      institutionId: null,
      institutionName: null,
    },
    management: {
      activeScope: "PLATFORM",
      defaultScope: "PLATFORM",
      allowedScopes: ["PLATFORM", "USER"],
      ownerInstitutionId: null,
      ownerInstitutionName: null,
    },
    institutions: [institution],
    presets: includeDraft ? [draft, publishedPreset] : [publishedPreset],
    selections: [{
      clinicalMode: "ADULT",
      platformPresetId: "preset-published",
      institutionPresetId: null,
      userPresetId: null,
      effectivePresetId: "preset-published",
      effectivePresetName: "LOSPORADULTS Rules",
      effectiveScope: "PLATFORM",
      effectiveVersion: 1,
    }],
    effectiveRules: [],
    overrides: [],
    reviewers: [],
  }
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ClinicalRulesPage preset creation", () => {
  it("selects the new draft and opens its first-rule editor", async () => {
    let draftCreated = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "/api/library/INTRAOP_DRUG" || url === "/api/library/INTRAOP_FLUID" || url === "/api/library/INTRAOP_INFUSION") return response([])
      if (url.startsWith("/api/clinical/rules/workbench") && init?.method === "POST") {
        draftCreated = true
        return response(draftPreset, 201)
      }
      if (url.startsWith("/api/clinical/rules/workbench")) {
        return response(workbench(draftCreated))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ClinicalRulesPage />)

    await screen.findByText("Available rulesets")
    const context = screen.getByLabelText("Editing context") as HTMLSelectElement
    expect(context.value).toBe("PLATFORM")
    expect(within(context).getByRole("option", { name: "Global · All institutions" })).toBeTruthy()
    expect(within(context).getByRole("option", { name: "My personal" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Create copy" }))
    fireEvent.change(screen.getByLabelText("Ruleset name"), {
      target: { value: "Adult draft" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }))

    expect(await screen.findByRole("heading", { name: "Adult draft v2" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }))
    await screen.findByTestId("adult-clinical-rule-editor")
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/clinical/rules/workbench",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"action":"create-ruleset"'),
        }),
      )
    })
    const workbenchGets = fetchMock.mock.calls
      .filter(([, init]) => init?.method !== "POST")
      .map(([input]) => String(input))
      .filter(url => url.startsWith("/api/clinical/rules/workbench"))
    expect(workbenchGets.every(url => !url.includes("institutionId="))).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clinical/rules/workbench",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"scope":"PLATFORM"'),
      }),
    )
  })

  it("expands an existing rule editor inside the clicked row", async () => {
    const propofolRule = {
      id: "rule-propofol",
      ruleKey: "ADULT_DRUG_PROFILE:PROPOFOL",
      ruleVersion: "LOSPOR_ADULTS.v2.draft1",
      payload: {
        kind: "ADULT_DRUG_PROFILE",
        itemKey: "Propofol",
        labelEn: "Propofol",
        labelBg: null,
        category: "Induction agents",
        profile: {
          kind: "bolus",
          mode: "dose",
          min: 0,
          max: 300,
          step: 10,
          rounding: "nearest_step",
          quickValues: [50, 100, 150],
          unit: "mg",
          routes: ["IV"],
          weightBasis: "none",
        },
        unit: "MG",
        routeUnits: { IV: "MG" },
      },
      sourceRefs: [],
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/library/INTRAOP_DRUG" || url === "/api/library/INTRAOP_FLUID" || url === "/api/library/INTRAOP_INFUSION") return response([])
      if (url.startsWith("/api/clinical/rules/workbench")) {
        return response(workbench(true, [propofolRule]))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ClinicalRulesPage />)

    await screen.findByText("Available rulesets")
    fireEvent.click(screen.getByRole("button", { name: /Adult draft v2/ }))
    const editButton = await screen.findByRole("button", { name: "Edit Propofol" })
    fireEvent.click(editButton)

    const row = screen.getByRole("article", { name: "Propofol" })
    expect(within(row).getByTestId("adult-clinical-rule-editor")).toBeTruthy()
    expect(editButton.getAttribute("aria-expanded")).toBe("true")

    fireEvent.change(screen.getByLabelText("Search rules"), {
      target: { value: "no matching drug" },
    })
    expect(screen.getByRole("article", { name: "Propofol" })).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Search rules"), {
      target: { value: "" },
    })
    const expandedEditButton = screen.getByRole("button", { name: "Edit Propofol" })
    fireEvent.click(expandedEditButton)
    expect(within(row).queryByTestId("adult-clinical-rule-editor")).toBeNull()
    expect(expandedEditButton.getAttribute("aria-expanded")).toBe("false")
  })

  it("keeps an existing pediatric fluid profile typed and supplies fluid catalog options", async () => {
    const fluidRule = {
      id: "rule-plasma-lyte",
      ruleKey: "PEDIATRIC_FLUID_PROFILE:PLASMA_LYTE:0-6574",
      ruleVersion: "PEDIATRIC.v1.draft1",
      payload: {
        kind: "PEDIATRIC_FLUID_PROFILE",
        itemKey: "PLASMA_LYTE",
        labelEn: "Plasma-Lyte",
        labelBg: null,
        category: "Crystalloids",
        minimumAgeDays: 0,
        maximumAgeDaysExclusive: 6574,
        profile: {
          kind: "fluid",
          mode: "dose",
          min: 0,
          max: 2_000,
          step: 50,
          rounding: "nearest_step",
          quickValues: [250, 500],
          unit: "mL",
          routes: ["IV"],
          defaultRoute: "IV",
          weightBasis: "none",
          fluidEntryModes: ["VOLUME", "RATE"],
          defaultFluidEntryMode: "RATE",
          fluidRate: {
            min: 1,
            max: 200,
            step: 1,
            allowManualOutsideRange: true,
            calculation: "HOLLIDAY_SEGAR_4_2_1",
          },
        },
        unit: "ML",
        routeUnits: { IV: "ML" },
      },
      sourceRefs: [],
    }
    const pediatricWorkbench = {
      ...workbench(false),
      clinicalMode: "PEDIATRIC",
      presets: [{
        ...draftPreset,
        id: "pediatric-draft",
        key: "PEDIATRIC_DRAFT",
        name: "Pediatric draft",
        clinicalMode: "PEDIATRIC",
        rules: [fluidRule],
      }],
      selections: [],
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/library/INTRAOP_DRUG") return response([])
      if (url === "/api/library/INTRAOP_FLUID") {
        return response([{
          value: "PLASMA_LYTE",
          label: "Plasma-Lyte",
          group: "Crystalloids",
        }])
      }
      if (url === "/api/library/INTRAOP_INFUSION") return response([])
      if (url.startsWith("/api/clinical/rules/workbench")) return response(pediatricWorkbench)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ClinicalRulesPage />)

    await screen.findByText("Available rulesets")
    fireEvent.click(screen.getByRole("button", { name: "Pediatric" }))
    await screen.findByRole("button", { name: "Edit Plasma-Lyte" })
    expect(screen.getByText(/Fluid.*Crystalloids.*mL.*IV/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Add drug" }))
    expect(screen.getByTestId("pediatric-drug-profile-editor")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add fluid/infusion" }))
    expect(screen.getByTestId("clinical-rule-editor").textContent).toContain("new")

    fireEvent.click(screen.getByRole("button", { name: "Edit Plasma-Lyte" }))
    const row = screen.getByRole("article", { name: "Plasma-Lyte" })
    expect(within(row).getByTestId("clinical-rule-editor").textContent)
      .toContain("PEDIATRIC_FLUID_PROFILE · PLASMA_LYTE · fluids:1")
  })

  it("collapses multi-band infusion profiles into one expandable row", async () => {
    const band = (id: string, from: number, to: number) => ({
      id,
      ruleKey: `PEDIATRIC_INFUSION_PROFILE:AMINOPHYLLINE:${from}-${to}`,
      ruleVersion: "PEDIATRIC.v1.draft1",
      payload: {
        kind: "PEDIATRIC_INFUSION_PROFILE",
        itemKey: "AMINOPHYLLINE",
        labelEn: "Aminophylline",
        labelBg: null,
        category: "Respiratory",
        disposition: "AUTO",
        routeDispositions: { IV: "AUTO" },
        manualEntryOnly: false,
        routeManualEntryOnly: { IV: false },
        minimumAgeDays: from,
        maximumAgeDaysExclusive: to,
        profile: {
          kind: "infusion",
          mode: "rate",
          min: 0,
          max: 20,
          step: 0.1,
          rounding: "nearest_step",
          quickValues: [1, 2],
          unit: "mg/kg/hr",
          routes: ["IV"],
          defaultRoute: "IV",
          weightBasis: "TBW",
        },
        unit: "MG_PER_KG_PER_HR",
        routeUnits: { IV: "MG_PER_KG_PER_HR" },
      },
      sourceRefs: [],
    })
    const pediatricWorkbench = {
      ...workbench(false),
      clinicalMode: "PEDIATRIC",
      presets: [{
        ...draftPreset,
        id: "pediatric-draft",
        key: "PEDIATRIC_DRAFT",
        name: "Pediatric draft",
        clinicalMode: "PEDIATRIC",
        rules: [band("rule-amino-1", 0, 365), band("rule-amino-2", 365, 6574)],
      }],
      selections: [],
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/library/INTRAOP_DRUG") return response([])
      if (url === "/api/library/INTRAOP_FLUID") return response([])
      if (url === "/api/library/INTRAOP_INFUSION") return response([])
      if (url.startsWith("/api/clinical/rules/workbench")) return response(pediatricWorkbench)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ClinicalRulesPage />)

    await screen.findByText("Available rulesets")
    fireEvent.click(screen.getByRole("button", { name: "Pediatric" }))

    // Two stored bands collapse into a single scannable row.
    const rows = await screen.findAllByRole("article", { name: "Aminophylline" })
    expect(rows).toHaveLength(1)
    expect(within(rows[0]!).getByText(/2 band\(s\)/)).toBeTruthy()
    // The group header itself is not directly editable — each band is.
    expect(screen.queryByRole("button", { name: "Edit Aminophylline" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Aminophylline" }))
    expect(screen.getByRole("button", { name: "Edit Aminophylline 0 d – 12 mo" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Delete Aminophylline 12 mo – 18 y" })).toBeTruthy()
  })

  it("limits a HOD to their institution and personal contexts", async () => {
    const hodWorkbench = {
      ...workbench(false),
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
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/library/INTRAOP_DRUG" || url === "/api/library/INTRAOP_FLUID" || url === "/api/library/INTRAOP_INFUSION") return response([])
      if (url.startsWith("/api/clinical/rules/workbench")) return response(hodWorkbench)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ClinicalRulesPage />)

    await screen.findByText("Available rulesets")
    const context = screen.getByLabelText("Editing context") as HTMLSelectElement
    expect(context.value).toBe("INSTITUTION")
    expect(within(context).getByRole("option", { name: "Test Hospital · Institution" })).toBeTruthy()
    expect(within(context).getByRole("option", { name: "My personal" })).toBeTruthy()
    expect(within(context).queryByRole("option", { name: /All institutions/ })).toBeNull()
    expect(screen.getByText(/Inherited read-only/)).toBeTruthy()
  })

  it("locks ordinary members to their personal context", async () => {
    const memberWorkbench = {
      ...workbench(false),
      actor: {
        id: "member-1",
        role: "CLINICIAN",
        institutionId: institution.id,
        institutionName: institution.name,
      },
      management: {
        activeScope: "USER",
        defaultScope: "USER",
        allowedScopes: ["USER"],
        ownerInstitutionId: institution.id,
        ownerInstitutionName: institution.name,
      },
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/library/INTRAOP_DRUG" || url === "/api/library/INTRAOP_FLUID" || url === "/api/library/INTRAOP_INFUSION") return response([])
      if (url.startsWith("/api/clinical/rules/workbench")) return response(memberWorkbench)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ClinicalRulesPage />)

    await screen.findByText("Available rulesets")
    const context = screen.getByLabelText("Editing context") as HTMLSelectElement
    expect(context.value).toBe("USER")
    expect(context.disabled).toBe(true)
    expect(within(context).getAllByRole("option")).toHaveLength(1)
    expect(within(context).getByRole("option", { name: "My personal" })).toBeTruthy()
  })
})
