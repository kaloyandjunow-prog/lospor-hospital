import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { FOLDER_NAME_SYSTEM, folderLabKey, labCodeKey, LOINC_SYSTEM } from "@lospor/core/ehr-lab-codes"

import { resolveFolderLabs } from "./ehr-folder-labs"

/**
 * A dropped file used to go through none of the naming the FHIR reader does,
 * so a laboratory export naming its tests `ХГБ` arrived unrecognised and was
 * refused -- with no route to ever fix it, on the transport a site reaches for
 * precisely when it cannot do FHIR.
 */
describe("a dropped file's labs are named the way a FHIR result's are", () => {
  const siteMap = {
    [labCodeKey(FOLDER_NAME_SYSTEM, folderLabKey("ХГБ"))]: "Haemoglobin (Hb)",
  }

  it("leaves a file written to our own names alone, and asks nothing", () => {
    const { labs, unmapped } = resolveFolderLabs([
      { test: "Haemoglobin (Hb)", value: "89", unit: "g/L" },
    ])

    expect(labs[0]).toMatchObject({ test: "Haemoglobin (Hb)" })
    // The operator's screen must not fill with questions that need no answer,
    // or an empty screen stops meaning "finished".
    expect(unmapped).toEqual([])
    // Nothing was renamed, so there is no reported label to carry.
    expect(labs[0]).not.toHaveProperty("reportedTest")
  })

  it("renames a local label the site has mapped, and keeps what they called it", () => {
    const { labs, unmapped } = resolveFolderLabs(
      [{ test: "ХГБ", value: "89", unit: "g/L" }],
      { siteMap },
    )

    expect(labs[0]).toMatchObject({ test: "Haemoglobin (Hb)", reportedTest: "ХГБ" })
    expect(unmapped).toEqual([])
  })

  it("imports an unmapped label under its own name and reports it once", () => {
    const { labs, unmapped } = resolveFolderLabs([
      { test: "ХГБ", value: "89", unit: "g/L" },
      { test: "ХГБ ", value: "91", unit: "g/L" },
    ])

    // Still imported: an absent result is reviewed by nobody. Stored trimmed,
    // so the clinician does not see the laboratory's stray whitespace either.
    expect(labs.map(l => l.test)).toEqual(["ХГБ", "ХГБ"])
    // One question, not two. The folded key is what stops a laboratory's
    // inconsistent spacing becoming two rows an operator answers twice.
    expect(unmapped).toHaveLength(1)
    expect(unmapped[0]).toMatchObject({ system: FOLDER_NAME_SYSTEM })
  })

  it("uses a code when the file carries one", () => {
    // The optional half: a site whose export already emits LOINC gets the same
    // resolution a FHIR site does, and keeps its mappings across a transport
    // change. Not required -- folder drop exists for sites that cannot code.
    const { labs, unmapped } = resolveFolderLabs([
      { test: "хемоглобин", system: LOINC_SYSTEM, code: "718-7", value: "89", unit: "g/L" },
    ])

    expect(labs[0]).toMatchObject({ test: "Haemoglobin (Hb)", reportedTest: "хемоглобин" })
    expect(unmapped).toEqual([])
  })

  it("lets a site's own mapping beat a shipped LOINC code", () => {
    // The resolver's deliberate rule, and worth pinning from this side too: a
    // hospital that has mapped its own label has said something specific about
    // its own laboratory, and a code we ship should never overrule it. So a
    // file whose LOINC disagrees with the site's mapping resolves to the
    // mapping -- which is also how a site fixes a laboratory that emits the
    // wrong code.
    const { labs } = resolveFolderLabs(
      [{ test: "ХГБ", system: LOINC_SYSTEM, code: "2345-7", value: "5.4" }],
      { siteMap },
    )

    expect(labs[0]).toMatchObject({ test: "Haemoglobin (Hb)" })
  })

  it("uses the code when nobody has mapped the name", () => {
    const { labs } = resolveFolderLabs(
      [{ test: "непознато", system: LOINC_SYSTEM, code: "2345-7", value: "5.4" }],
    )

    expect(labs[0]).toMatchObject({ test: "Glucose", reportedTest: "непознато" })
  })
})

describe("a site's stated unit fills a gap in a dropped file", () => {
  const assumedUnits = {
    [labCodeKey(FOLDER_NAME_SYSTEM, folderLabKey("ХГБ"))]: "g/L",
  }

  it("supplies a unit for a result that arrived without one", () => {
    // The FHIR reader has done this since it was written. Without it a unitless
    // folder result went straight to unconvertible and was offered flagged,
    // for a reason the site had already answered.
    const { labs } = resolveFolderLabs([{ test: "ХГБ", value: "89" }], { assumedUnits })

    expect(labs[0]).toMatchObject({ unit: "g/L" })
  })

  it("never replaces a unit the file reported", () => {
    // The stated unit fills a gap; it does not overrule the laboratory. A
    // hospital that reports g/dL for one analyser and g/L for another would
    // otherwise have the second silently relabelled.
    const { labs } = resolveFolderLabs(
      [{ test: "ХГБ", value: "8.9", unit: "g/dL" }],
      { assumedUnits },
    )

    expect(labs[0]).toMatchObject({ unit: "g/dL" })
  })
})

describe("nothing is dropped on the way through", () => {
  it("passes a nameless result along to be refused downstream", () => {
    // Refusing it here would refuse it silently. The canonical normaliser
    // rejects it the same way it rejects one from any other transport.
    const { labs, unmapped } = resolveFolderLabs([{ value: "89", unit: "g/L" }])

    expect(labs).toHaveLength(1)
    expect(unmapped).toEqual([])
  })

  it("survives a file whose labs are not a list", () => {
    expect(resolveFolderLabs(undefined)).toEqual({ labs: [], unmapped: [] })
    expect(resolveFolderLabs("nonsense")).toEqual({ labs: [], unmapped: [] })
  })

  it("keeps every other field the file carried", () => {
    const { labs } = resolveFolderLabs([
      { test: "Haemoglobin (Hb)", value: "89", unit: "g/L", takenAt: "2026-09-05T07:30:00Z" },
    ])

    expect(labs[0]).toMatchObject({ value: "89", takenAt: "2026-09-05T07:30:00Z" })
  })
})
