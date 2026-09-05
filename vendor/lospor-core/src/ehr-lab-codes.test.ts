import { describe, expect, it } from "vitest"

import {
  FOLDER_NAME_SYSTEM,
  folderLabCoding,
  folderLabKey,
  labCodeKey,
  looseLabKey,
  LOINC_SYSTEM,
  LOINC_TO_LAB_TEST,
  resolveLabTest,
  unmappedLabCodes,
} from "./ehr-lab-codes"
import { LAB_NAME_ALIASES } from "./ehr-lab-aliases"
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
    const result = resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Специфичен тест 7" }], { siteMap })

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
    const result = resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Специфичен тест 7" }])

    expect(result).toMatchObject({ test: "Специфичен тест 7", via: "display", unmapped: true })
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
      { text: "Специфичен тест 7" },
    )

    expect(result.test).toBe("Специфичен тест 7")
  })

  it("never returns an empty name", async () => {
    expect(resolveLabTest([]).test).toBe("Unnamed result")
    expect(resolveLabTest(undefined).test).toBe("Unnamed result")
  })

  it("reports the coding it could not place, so a site can map it", async () => {
    const result = resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Специфичен тест 7" }])

    expect(result.unresolved).toEqual({ system: LOCAL, code: "ХГБ", display: "Специфичен тест 7" })
  })
})

describe("telling a site what is left to map", () => {
  it("counts each unrecognised code once per result", async () => {
    // A site cannot configure a mapping for a code it has never seen. Pulling
    // real results and reporting what came back unrecognised turns
    // configuration from a specification exercise into reading a list.
    const resolved = [
      resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Специфичен тест 7" }]),
      resolveLabTest([{ system: LOCAL, code: "ХГБ", display: "Специфичен тест 7" }]),
      resolveLabTest([{ system: LOCAL, code: "ТРОМБ", display: "Специфичен тест 9" }]),
      resolveLabTest([{ system: LOINC_SYSTEM, code: "718-7" }]),
    ]

    expect(unmappedLabCodes(resolved)).toEqual([
      { system: LOCAL, code: "ХГБ", display: "Специфичен тест 7", count: 2 },
      { system: LOCAL, code: "ТРОМБ", display: "Специфичен тест 9", count: 1 },
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
    // Two codes for one test is a decision, not a mistake, when the codes
    // differ by unit rather than by analyte -- a hospital sends whichever its
    // laboratory reports in, and both are the same measurement. Naming the
    // deliberate ones here keeps the check meaningful: a copy-paste still
    // fails, and adding a synonym is a line someone has to write on purpose.
    const DELIBERATE_SYNONYMS = new Set([
      // 2160-0 mass per volume (mg/dL); 14682-9 moles per volume (µmol/L),
      // which is what this register stores and exports.
      "Creatinine",
      // Same reasoning, added when the seeded codes were corrected: a
      // laboratory reports these in mass or in moles and we accept both.
      "Urea (BUN)",
      "Glucose",
      // Not a unit but a reporting convention: 48065-7 is fibrinogen-equivalent
      // units and 48066-5 is D-dimer units, which differ by about a factor of
      // two. We export FEU, because that is what we store, and accept either
      // because a hospital reports in whichever its assay uses.
      "D-dimer",
    ])
    const counts = new Map<string, number>()
    for (const test of Object.values(LOINC_TO_LAB_TEST)) {
      counts.set(test, (counts.get(test) ?? 0) + 1)
    }
    const unexplained = [...counts]
      .filter(([test, count]) => count > 1 && !DELIBERATE_SYNONYMS.has(test))
      .map(([test]) => test)

    expect(unexplained.sort(), "two codes for one test, with no reason given").toEqual([])
  })

  it("covers an arterial blood gas, which arrives as components", () => {
    // Without these an ABG resolved to bare numbers like "2744-1", and every
    // panel landed as four unrecognised tests for a site to map by hand.
    for (const code of ["2744-1", "2019-8", "2703-7", "1960-4", "1925-7", "2708-6", "2518-9"]) {
      expect(LOINC_TO_LAB_TEST[code]).toBeTruthy()
    }
  })
})

/**
 * A dropped file names its tests rather than coding them, so the name becomes
 * a code under a reserved system. One table, one screen and one resolver then
 * serve both transports instead of two of each.
 */
describe("a folder-drop result is resolved like a coded one", () => {
  it("recognises our own test name without asking a site to map it", () => {
    // The ordinary case: a file written to our field names. Marking these
    // unmapped would fill the operator's screen with questions that need no
    // answer, and an empty screen would stop meaning "finished".
    const resolved = resolveLabTest([folderLabCoding("Haemoglobin (Hb)")])

    expect(resolved).toMatchObject({ test: "Haemoglobin (Hb)", via: "name", unmapped: false })
  })

  it("lets a site map a name it uses locally", () => {
    const siteMap = { [labCodeKey(FOLDER_NAME_SYSTEM, folderLabKey("ХГБ"))]: "Haemoglobin (Hb)" }
    const resolved = resolveLabTest([folderLabCoding("ХГБ")], { siteMap })

    expect(resolved).toMatchObject({ test: "Haemoglobin (Hb)", via: "site", unmapped: false })
  })

  it("imports an unmapped name under the hospital's own label, and asks", () => {
    const resolved = resolveLabTest([folderLabCoding("Специфичен тест 7")])

    // Still imported -- an absent result is reviewed by nobody -- but flagged
    // so the site can be asked, with the label as it arrived rather than the
    // folded key.
    expect(resolved.test).toBe("Специфичен тест 7")
    expect(resolved.unmapped).toBe(true)
    expect(resolved.unresolved).toMatchObject({ system: FOLDER_NAME_SYSTEM, display: "Специфичен тест 7" })
  })

  /**
   * The failure this key exists to prevent. A laboratory's label is not typed
   * consistently, and without folding, one test becomes three rows an operator
   * answers three times -- while the counts that are meant to say which matters
   * are split between them.
   */
  it("folds spacing, case and Unicode form so one label is one row", () => {
    const keys = new Set(["ХГБ", "ХГБ ", "  ХГБ", "хгб"].map(folderLabKey))

    expect(keys.size).toBe(1)
  })

  it("keeps genuinely different labels apart", () => {
    expect(folderLabKey("Sodium")).not.toBe(folderLabKey("Potassium"))
  })

  it("prefers a code over a name when the file carries one", () => {
    // The optional half of the folder contract: a site whose export already
    // has LOINC gets the same resolution a FHIR site does, and keeps its
    // mappings if it ever switches transport.
    const resolved = resolveLabTest(
      [{ system: LOINC_SYSTEM, code: "718-7", display: "whatever they call it" }],
    )

    expect(resolved).toMatchObject({ test: "Haemoglobin (Hb)", via: "loinc" })
  })
})

/**
 * Recognising the labels hospitals actually use, so the mapping screen is left
 * for the ones that genuinely need a human. A screen full of `HGB` and
 * `Хемоглобин` is a screen somebody stops opening.
 */
describe("the labels hospitals use are recognised", () => {
  it("knows the common abbreviations", () => {
    for (const [label, expected] of [
      ["HGB", "Haemoglobin (Hb)"],
      ["Hb", "Haemoglobin (Hb)"],
      ["WBC", "Leucocytes (WBC)"],
      ["Crea", "Creatinine"],
      ["INR", "INR"],
      ["CRP", "CRP"],
    ] as const) {
      expect(resolveLabTest([folderLabCoding(label)]), label)
        .toMatchObject({ test: expected, unmapped: false })
    }
  })

  it("knows Bulgarian labels, which is what a laboratory here exports", () => {
    for (const [label, expected] of [
      ["ХГБ", "Haemoglobin (Hb)"],
      ["Хемоглобин", "Haemoglobin (Hb)"],
      ["Тромбоцити", "Platelets"],
      ["Кръвна захар", "Glucose"],
      ["Креатинин", "Creatinine"],
      ["Калий", "Potassium (K⁺)"],
    ] as const) {
      expect(resolveLabTest([folderLabCoding(label)]), label)
        .toMatchObject({ test: expected, unmapped: false })
    }
  })

  /**
   * The rule that keeps this list short. An alias whose analyte is clear but
   * whose *measurement* is not would put a value in a field whose reference
   * range does not apply -- the same clinical error a wrong LOINC code causes.
   */
  it("refuses the labels that do not say which test they mean", () => {
    for (const label of ["Troponin", "T4", "T3"]) {
      expect(resolveLabTest([folderLabCoding(label)]), label)
        .toMatchObject({ unmapped: true })
    }
  })

  it("never lets an alias shadow one of our own test names", () => {
    // Our names are loaded last and win. An alias colliding with a real test
    // name would rename that test to something else entirely.
    for (const test of LAB_LIBRARY) {
      expect(resolveLabTest([folderLabCoding(test.name)]).test, test.name).toBe(test.name)
    }
  })

  it("points every alias at a test that exists", () => {
    const names = new Set(LAB_LIBRARY.map(test => test.name))
    const dangling = Object.entries(LAB_NAME_ALIASES)
      .filter(([, test]) => !names.has(test))
      .map(([alias, test]) => `${alias} -> ${test}`)

    expect(dangling.sort(), "an alias naming a test the register does not have").toEqual([])
  })
})

/**
 * One label written several ways.
 *
 * `Na⁺`, `Na+` and `Na +` are the same thing, and so are `IL-6`, `IL 6` and
 * `il6`. Enumerating every spelling by hand is work that never finishes -- the
 * next laboratory writes a fourth -- and each one missed fails silently, as a
 * result nobody could place.
 */
describe("punctuation and typography do not decide whether a label is known", () => {
  it("reads a symbol written any of the usual ways", () => {
    for (const [written, expected] of [
      ["Na⁺", "Sodium (Na⁺)"],
      ["Na+", "Sodium (Na⁺)"],
      ["Na +", "Sodium (Na⁺)"],
      ["Cl-", "Chloride (Cl⁻)"],
      ["Ca²⁺", "Calcium (Ca²⁺)"],
      ["Ca2+", "Calcium (Ca²⁺)"],
      ["Mg2+", "Magnesium (Mg²⁺)"],
    ] as const) {
      expect(resolveLabTest([folderLabCoding(written)]), written)
        .toMatchObject({ test: expected, unmapped: false })
    }
  })

  it("reads a hyphen, a space and nothing as the same separator", () => {
    for (const written of ["IL-6", "IL 6", "il6", "интерлевкин-6", "интерлевкин 6"]) {
      expect(resolveLabTest([folderLabCoding(written)]).test, written).toBe("IL-6")
    }
    for (const written of ["CK-MB", "CK MB", "ckmb"]) {
      expect(resolveLabTest([folderLabCoding(written)]).test, written).toBe("CK-MB")
    }
  })

  /**
   * The guarantee the loose index rests on. Throwing punctuation away merges
   * labels, and if it ever merged two *different* tests it would silently pick
   * one -- putting a value in a field whose reference range does not apply.
   * Checked rather than assumed, over every test name and every alias.
   */
  it("never lets two different tests share a loosened label", () => {
    const byLoose = new Map<string, Set<string>>()
    const record = (label: string, test: string) => {
      const key = looseLabKey(label)
      if (!key) return
      if (!byLoose.has(key)) byLoose.set(key, new Set())
      byLoose.get(key)!.add(test)
    }
    for (const test of LAB_LIBRARY) record(test.name, test.name)
    for (const [alias, test] of Object.entries(LAB_NAME_ALIASES)) record(alias, test)

    const merged = [...byLoose]
      .filter(([, tests]) => tests.size > 1)
      .map(([key, tests]) => `${key}: ${[...tests].join(" / ")}`)

    expect(merged.sort(), "one loosened label, two different tests").toEqual([])
  })

  it("still prefers an exact label over a loosened one", () => {
    // Exactness is not merely faster: it is the statement a site actually made.
    expect(resolveLabTest([folderLabCoding("ХГБ")])).toMatchObject({ test: "Haemoglobin (Hb)" })
  })
})
