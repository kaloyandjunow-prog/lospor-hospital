import { describe, expect, it } from "vitest"

import { formatPremedicationEntry } from "./intraop-entries"
import {
  isPremedicationAsOrdered,
  parsePremedicationEntries,
  premedicationOrderProblems,
  premedicationPrefill,
  premedicationAtcCode,
  premedicationDate,
  premedicationPhaseOf,
  PREMEDICATION_PHASES,
} from "./premedication"
import { PREMED_ATC_CODES, PREMED_DOSES } from "./catalog/premed-drugs"

describe("a premedication entry", () => {
  it("reads back into the drug, its ATC code, dose, unit and route the picker wrote", () => {
    const entry = formatPremedicationEntry({ name: "Midazolam", unit: "mg" }, "7.5", "Buccal")
    expect(parsePremedicationEntries(`${entry}; Paracetamol 1000 mg PO`, "MORNING")).toEqual([
      { phase: "MORNING", entry: "Midazolam 7.5 mg Buccal", drug: "Midazolam", atcCode: "N05CD08", dose: 7.5, unit: "mg", route: "Buccal" },
      { phase: "MORNING", entry: "Paracetamol 1000 mg PO", drug: "Paracetamol", atcCode: "N02BE01", dose: 1000, unit: "mg", route: "PO" },
    ])
  })

  it("prefers the longest drug name, and keeps a drug the catalogue leaves uncoded", () => {
    const [citrate] = parsePremedicationEntries("Sodium citrate 30 mL PO", "MORNING")
    expect(citrate).toMatchObject({ drug: "Sodium citrate", atcCode: null, dose: 30, unit: "mL", route: "PO" })
    expect(parsePremedicationEntries("Ketamine 1 mg/kg PO", "DAY_BEFORE")[0]).toMatchObject({ unit: "mg/kg", atcCode: "N01AX03" })
  })

  it("keeps an entry naming no catalogue drug, without guessing a code", () => {
    expect(parsePremedicationEntries("Something the family gave", "DAY_BEFORE")).toEqual([
      { phase: "DAY_BEFORE", entry: "Something the family gave", drug: null, atcCode: null, dose: null, unit: null, route: null },
    ])
  })

  it("skips a phase marked not applicable", () => {
    expect(parsePremedicationEntries("N/A", "DAY_BEFORE")).toEqual([])
    expect(parsePremedicationEntries("", "MORNING")).toEqual([])
  })
})

describe("premedication codes and timing", () => {
  it("codes every catalogue drug but the two left uncoded on purpose", () => {
    const uncoded = Object.keys(PREMED_DOSES).filter(name => !PREMED_ATC_CODES[name])
    expect(uncoded.sort()).toEqual(["Insulin", "Sodium citrate"])
    expect(Object.values(PREMED_ATC_CODES).every(code => /^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(code))).toBe(true)
    expect(premedicationAtcCode(" gabapentin ")).toBe("N02BF01")
  })

  it("dates the day before as D-1 and the morning before surgery as D", () => {
    expect(premedicationDate("2026-03-01", "DAY_BEFORE")).toBe("2026-02-28")
    expect(premedicationDate("2026-03-01T08:30:00Z", "MORNING")).toBe("2026-03-01")
    expect(premedicationDate(null, "MORNING")).toBeNull()
    expect(PREMEDICATION_PHASES.DAY_BEFORE.en).toBe("The night before surgery")
    expect(PREMEDICATION_PHASES.MORNING.bg).toBe("Сутринта в деня на операцията")
  })

  it("reads the phase names earlier records used", () => {
    expect(premedicationPhaseOf("evening")).toBe("DAY_BEFORE")
    expect(premedicationPhaseOf("day-before")).toBe("DAY_BEFORE")
    expect(premedicationPhaseOf("morning")).toBe("MORNING")
    expect(premedicationPhaseOf("afternoon")).toBeNull()
  })
})

describe("premedication ordered at the preop visit", () => {
  const ordered = "Midazolam 7.5 mg PO; Pantoprazole 40 mg PO"

  it("fills an empty phase of the intraoperative record with the order", () => {
    for (const empty of [undefined, null, "", "  "]) expect(premedicationPrefill(empty, ordered)).toBe(ordered)
  })

  it("never overwrites a phase someone has filled or marked not applicable", () => {
    expect(premedicationPrefill("Diazepam 10 mg PO", ordered)).toBeNull()
    expect(premedicationPrefill("N/A", ordered)).toBeNull()
  })

  it("fills nothing when nothing was ordered", () => {
    for (const none of [undefined, null, "", "N/A", " ; "]) expect(premedicationPrefill(null, none)).toBeNull()
  })

  it("tells a phase still as ordered from one since edited", () => {
    expect(isPremedicationAsOrdered("Midazolam 7.5 mg PO;Pantoprazole 40 mg PO", ordered)).toBe(true)
    expect(isPremedicationAsOrdered("Midazolam 7.5 mg PO", ordered)).toBe(false)
    expect(isPremedicationAsOrdered("Pantoprazole 40 mg PO; Midazolam 7.5 mg PO", ordered)).toBe(false)
    expect(isPremedicationAsOrdered("", "")).toBe(false)
  })

  it("keeps an order within bounds and to the two phases", () => {
    expect(premedicationOrderProblems({ DAY_BEFORE: ordered, MORNING: null })).toEqual([])
    expect(premedicationOrderProblems({ NOON: ordered })).toEqual([{ code: "UNKNOWN_PHASE", phase: "NOON" }])
    expect(premedicationOrderProblems({ MORNING: Array.from({ length: 21 }, (_, i) => `Drug${i} 1 mg PO`).join("; ") })).toEqual([{ code: "TOO_MANY_ENTRIES", phase: "MORNING" }])
    expect(premedicationOrderProblems({ MORNING: "x".repeat(201) })).toEqual([{ code: "ENTRY_TOO_LONG", phase: "MORNING" }])
  })
})
