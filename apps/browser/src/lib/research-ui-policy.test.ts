import { describe, expect, it } from "vitest"
import type { ResearchExportRecord, ResearchPermissionSet } from "@lospor/core/research"
import {
  benchmarkChartState,
  benchmarkMetricChoices,
  canDownloadResearchExport,
  canOfferOmopExport,
  canViewResearchNavigation,
  researchExportArtifactExpired,
  researchExportsNeedPolling,
} from "./research-ui-policy"

const permissions: ResearchPermissionSet = {
  query: true,
  inspectCases: false,
  compare: true,
  benchmark: true,
  savePrivateCohorts: true,
  shareInstitutionCohorts: false,
  export: false,
  exportOmop: false,
  manageAccess: false,
}

function exportRecord(overrides: Partial<ResearchExportRecord> = {}): ResearchExportRecord {
  return {
    id: "export-1",
    name: "Export",
    format: "csv",
    status: "PENDING",
    definition: { version: 1, filters: { statuses: ["COMPLETE"] } },
    rowCount: null,
    checksum: null,
    error: null,
    asOf: null,
    definitionHash: null,
    snapshotHash: null,
    matchingCases: null,
    sourceCommit: null,
    filename: null,
    contentType: null,
    byteSize: null,
    sourceVersion: "7.2.0",
    generatedAt: null,
    revisionManifestVersion: 2,
    expiresAt: null,
    artifactAvailable: false,
    legacy: false,
    createdAt: "2026-07-27T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  }
}

describe("research Browser policy", () => {
  it("hides case and export navigation outside their individual grants", () => {
    expect(canViewResearchNavigation(permissions, null)).toBe(true)
    expect(canViewResearchNavigation(permissions, "inspectCases")).toBe(false)
    expect(canViewResearchNavigation(permissions, "export")).toBe(false)
    expect(canViewResearchNavigation({ ...permissions, inspectCases: true }, "inspectCases")).toBe(true)
  })

  it("offers OMOP only when both export permissions are present", () => {
    expect(canOfferOmopExport({ ...permissions, exportOmop: true })).toBe(false)
    expect(canOfferOmopExport({ ...permissions, export: true, exportOmop: true })).toBe(true)
  })

  it("polls active jobs and downloads only complete nonlegacy artifacts", () => {
    expect(researchExportsNeedPolling([exportRecord()])).toBe(true)
    expect(researchExportsNeedPolling([exportRecord({ status: "RUNNING" })])).toBe(true)
    expect(researchExportsNeedPolling([exportRecord({ status: "COMPLETE" })])).toBe(false)
    expect(canDownloadResearchExport(exportRecord({ status: "COMPLETE", artifactAvailable: true }))).toBe(true)
    expect(canDownloadResearchExport(exportRecord({ status: "FAILED", artifactAvailable: true }))).toBe(false)
    expect(canDownloadResearchExport(exportRecord({ status: "COMPLETE", legacy: true, artifactAvailable: true }))).toBe(false)
    expect(canDownloadResearchExport(exportRecord({ status: "COMPLETE", artifactAvailable: false }))).toBe(false)
  })

  it("blocks stale clients from downloading an expired artifact", () => {
    const now = Date.parse("2026-07-28T12:00:00.000Z")
    const record = exportRecord({
      status: "COMPLETE",
      artifactAvailable: true,
      expiresAt: "2026-07-28T11:59:59.000Z",
    })
    expect(researchExportArtifactExpired(record, now)).toBe(true)
    expect(canDownloadResearchExport(record, now)).toBe(false)
    expect(researchExportArtifactExpired({
      ...record,
      expiresAt: "2026-07-28T12:00:01.000Z",
    }, now)).toBe(false)
  })
})

describe("benchmarkChartState", () => {
  const point = (suppressed: boolean) => ({ suppressed })

  it("calls an empty result no data, not suppression", () => {
    expect(benchmarkChartState([])).toBe("noData")
  })

  it("distinguishes a fully withheld result from an empty one", () => {
    expect(benchmarkChartState([point(true), point(true)])).toBe("allSuppressed")
  })

  it("still plots when only some periods are withheld", () => {
    expect(benchmarkChartState([point(true), point(false)])).toBe("partiallySuppressed")
  })

  it("plots plainly when nothing is withheld", () => {
    expect(benchmarkChartState([point(false), point(false)])).toBe("plottable")
  })
})

describe("benchmarkMetricChoices", () => {
  const supported = ["caseCount", "meanAgeYears"] as const
  const contract = ["caseCount", "meanAgeYears", "complicationRate"] as const

  it("offers what the server says it can plot", () => {
    expect(benchmarkMetricChoices(supported, contract)).toEqual(["caseCount", "meanAgeYears"])
  })

  it("falls back to the contract only while capabilities are unknown", () => {
    expect(benchmarkMetricChoices(undefined, contract)).toEqual(contract)
  })

  it("never offers a wider list because the server answered with none", () => {
    // An empty list from the server means "ask again", not "offer everything";
    // the fallback is the shared contract, which is still not all fourteen.
    expect(benchmarkMetricChoices([], contract)).toEqual(contract)
  })
})
