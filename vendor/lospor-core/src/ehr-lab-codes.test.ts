import { describe, expect, it } from "vitest"

import {
  labCodeKey,
  LOINC_SYSTEM,
  LOINC_TO_LAB_TEST,
  resolveLabTest,
  unmappedLabCodes,
} from "./ehr-lab-codes"
import { LAB_LIBRARY } from "./labs"

/**
 * The same haemoglobin arrives as LOINC 718-7, as a local HGB, or as ХГБ,
 * depending on the hospital — and which one is not discoverable from any
 * specification. What matters is that a result we cannot name is still
 * imported: dropping it loses clinical data silently, and silently is the part
 * that matters, because nobody reviews an absence.
 */

const LOCAL = "http://hospital.bg/labs"

describe("a code we ship a meaning for", () => {
  it("recognises LOINC without any site configuration", async () => {
    const result = resolveLabTest([{ system: LOINC_SYSTEM, code: "718-7", display: "Hemoglobin" }])

    expect(result).toMatchObject({ test: "Haemoglobin (Hb)", via: "loinc", unmapped: false })
  })

  it("ignores a LOINC code we have no mapping for rather than guessing", async () => {
    // A wrong mapping is a clinical error; an unmapped one is a clinician
    // reading the hospital's own name for it.
    const result = resolveLabTest([
      { system: LOINC_SYSTEM, code: "99999-9", display: "Some assay" },
    ])

    expect(result.unmapped).toBe(true)
    expect(result.test).toBe("Some assay")
  })

  it("does not treat a local code as LOINC because it looks like one", async () => {
    const result = resolveLabTest([{ system: LOCAL, code: "718-7", display: "Something else" }])

    expect(result.unmapped).toBe(true)
    expect(result.test).toBe("Something else")
  })
})

describe("a code only the site can explain", () => {
  const siteMap = { [labCodeKey(LOCAL, "ХГБ")]: "Haemoglobin (Hb)" }

  it("uses the site's own mapping", async () => {
    const result = resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Хемоглобин" }], { siteMap })

    expect(result).toMatchObject({ test: "Haemoglobin (Hb)", via: "site", unmapped: false })
  })

  it("lets the site override a shipped LOINC mapping", async () => {
    // A hospital that has mapped its own code has said something specific
    // about its own laboratory, and a shipped default must not overrule it.
    const result = resolveLabTest(
      [
        { system: LOINC_SYSTEM, code: "718-7" },
        { system: LOCAL, code: "ХГБ" },
      ],
      { siteMap: { [labCodeKey(LOINC_SYSTEM, "718-7")]: "Erythrocytes (RBC)" } },
    )

    expect(result).toMatchObject({ test: "Erythrocytes (RBC)", via: "site" })
  })

  it("falls through to LOINC when the site has mapped a different code", async () => {
    const result = resolveLabTest(
      [{ system: LOINC_SYSTEM, code: "718-7" }],
      { siteMap: { [labCodeKey(LOCAL, "ХГБ")]: "Platelets" } },
    )

    expect(result).toMatchObject({ test: "Haemoglobin (Hb)", via: "loinc" })
  })
})

describe("a result nobody has named is still imported", () => {
  it("carries the hospital's own label through", async () => {
    // "ХГБ 89 g/L" is perfectly readable to the clinician reviewing it.
    const result = resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Хемоглобин" }])

    expect(result).toMatchObject({ test: "Хемоглобин", via: "display", unmapped: true })
  })

  it("uses the code when there is no label at all", async () => {
    const result = resolveLabTest([{ system: LOCAL, code: "ХГБ" }])

    expect(result).toMatchObject({ test: "ХГБ", via: "code", unmapped: true })
  })

  it("prefers the concept's own text over a coding's display", async () => {
    // Observation.code.text is what the laboratory printed, which is closer to
    // what the clinician expects to see than a coding's formal display.
    const result = resolveLabTest(
      [{ system: LOCAL, code: "X", display: "Formal name" }],
      { text: "Хемоглобин" },
    )

    expect(result.test).toBe("Хемоглобин")
  })

  it("never returns an empty name", async () => {
    expect(resolveLabTest([]).test).toBe("Unnamed result")
    expect(resolveLabTest(undefined).test).toBe("Unnamed result")
  })

  it("reports the coding it could not place, so a site can map it", async () => {
    const result = resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Хемоглобин" }])

    expect(result.unresolved).toEqual({ system: LOCAL, code: "ХГБ", display: "Хемоглобин" })
  })
})

describe("telling a site what is left to map", () => {
  it("counts each unrecognised code once per result", async () => {
    // A site cannot configure a mapping for a code it has never seen. Pulling
    // real results and reporting what came back unrecognised turns
    // configuration from a specification exercise into reading a list.
    const resolved = [
      resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Хемоглобин" }]),
      resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Хемоглобин" }]),
      resolveLabTest([{ system: LOCAL, code: "ТРОМБ", display: "Тромбоцити" }]),
      resolveLabTest([{ system: LOINC_SYSTEM, code: "718-7" }]),
    ]

    expect(unmappedLabCodes(resolved)).toEqual([
      { system: LOCAL, code: "ХГБ", display: "Хемоглобин", count: 2 },
      { system: LOCAL, code: "ТРОМБ", display: "Тромбоцити", count: 1 },
    ])
  })

  it("puts the most common first, because that is where the effort pays", async () => {
    const resolved = [
      resolveLabTest([{ system: LOCAL, code: "RARE" }]),
      resolveLabTest([{ system: LOCAL, code: "COMMON" }]),
      resolveLabTest([{ system: LOCAL, code: "COMMON" }]),
    ]

    expect(unmappedLabCodes(resolved)[0].code).toBe("COMMON")
  })

  it("lists nothing when everything was recognised", async () => {
    expect(unmappedLabCodes([resolveLabTest([{ system: LOINC_SYSTEM, code: "718-7" }])]))
      .toEqual([])
  })
})

describe("every shipped mapping names a test that exists", () => {
  // Eight of the first twenty-four did not. "Sodium (Na)" against our
  // "Sodium (Na⁺)", "ALT" against "ALT (SGPT)" — each one a code that resolves
  // to a name nothing downstream recognises, so the result is treated as
  // unmappable and the site is asked to map a code we already shipped.
  //
  // Nothing checked it, because the table is a plain record and a wrong value
  // is still a string. This is the check.
  it("resolves to a name in the library, for all of them", () => {
    const known = new Set(LAB_LIBRARY.map(test => test.name))
    const wrong = Object.entries(LOINC_TO_LAB_TEST).filter(([, test]) => !known.has(test))

    expect(wrong).toEqual([])
  })

  it("does not map two codes to the same test by accident", () => {
    // Not forbidden in principle, but every current entry is one code for one
    // test, so a duplicate today means a copy-paste rather than a decision.
    const tests = Object.values(LOINC_TO_LAB_TEST)

    expect(new Set(tests).size).toBe(tests.length)
  })

  it("covers an arterial blood gas, which arrives as components", () => {
    // Without these an ABG resolved to bare numbers like "2744-1", and every
    // panel landed as four unrecognised tests for a site to map by hand.
    for (const code of ["2744-1", "2019-8", "2703-7", "1960-4", "1925-7", "2708-6", "2518-9"]) {
      expect(LOINC_TO_LAB_TEST[code]).toBeTruthy()
    }
  })
})
