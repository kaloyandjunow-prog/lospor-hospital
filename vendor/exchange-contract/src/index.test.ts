import { describe, expect, it } from "vitest"
import {
  EXCHANGE_SCHEMA,
  canonicalJson,
  compareSequence,
  validateManifest,
  type ExchangeManifestV1,
  type VersionSet,
} from "./index.js"

function validManifest(): ExchangeManifestV1 {
  return {
    schema: EXCHANGE_SCHEMA,
    manifestVersion: 1,
    batchId: "batch-1",
    sequence: 1,
    previousBatchId: null,
    generatedAt: "2026-07-28T12:00:00.000Z",
    cutoffFrom: null,
    cutoffTo: "2026-07-28T12:00:00.000Z",
    site: { siteId: "site-1", siteCode: "HOSP-A", institutionId: "inst-1" },
    versions: {
      hospital: "1.0.0",
      api: "7.3.2-hospital.1",
      core: "7.3.0",
      omopSource: "3.6.0",
      databaseSchema: "37",
      dataDictionary: "lospor-dictionary-2026.07",
      conceptMap: "local-bilingual-map-v2",
      redactionProfile: "bg-en-v1",
    },
    qualityStatus: "PASS",
    cases: [{
      casePseudonym: "case_x",
      personPseudonym: "person_x",
      sourcePersonId: "101",
      sourceObservationPeriodId: "151",
      sourceVisitId: "201",
      action: "UPSERT",
      clinicalRevision: 4,
      eventRevision: 2,
      relationalRevision: 4,
      preopRevision: 1,
      intraopRevision: 2,
      postopRevision: 1,
      finalizedAt: "2026-07-28T11:00:00.000Z",
      operationStartedAt: "2026-07-28T08:35:00.000Z",
      exclusionReasonCode: null,
    }],
    tables: [{
      table: "person",
      filename: "person.csv",
      rowCount: 1,
      byteSize: 42,
      sha256: "a".repeat(64),
    }],
    exclusions: {
      policyExcluded: 0,
      caseExcluded: 0,
      qualityRejected: 0,
      withdrawn: 0,
    },
    payloadSha256: "b".repeat(64),
  }
}

describe("exchange contract", () => {
  it("validates a complete v1 manifest", () => {
    const manifest = validManifest()
    expect(validateManifest(manifest)).toEqual({ ok: true, manifest })
  })

  it("rejects a batch that does not declare its data dictionary version", () => {
    const undeclared = validManifest()
    delete (undeclared.versions as Partial<VersionSet>).dataDictionary
    const absent = validateManifest(undeclared)
    expect(absent.ok).toBe(false)
    if (!absent.ok) expect(absent.errors).toContain("versions.dataDictionary is required")

    const blank = validManifest()
    blank.versions.dataDictionary = ""
    const empty = validateManifest(blank)
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.errors).toContain("versions.dataDictionary is required")
  })

  it("rejects malformed revisions and checksums", () => {
    const manifest = validManifest()
    manifest.cases[0]!.clinicalRevision = -1
    manifest.payloadSha256 = "broken"
    const result = validateManifest(manifest)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain("cases[0].clinicalRevision is invalid")
      expect(result.errors).toContain("payloadSha256 is invalid")
    }
  })

  it("canonicalizes object order and preserves array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}')
  })

  it("classifies sequence state", () => {
    expect(compareSequence(4, 4)).toBe("EXPECTED")
    expect(compareSequence(4, 3)).toBe("DUPLICATE")
    expect(compareSequence(4, 7)).toBe("GAP")
  })
})
