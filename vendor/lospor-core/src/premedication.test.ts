import { describe, expect, it } from "vitest"

import { formatPremedicationEntry } from "./intraop-entries"
import {
  parsePremedicationEntries,
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
    expect(PREMEDICATION_PHASES.DAY_BEFORE.en).toBe("The day before")
    expect(PREMEDICATION_PHASES.MORNING.bg).toBe("Сутринта преди операцията")
  })

  it("reads the phase names earlier records used", () => {
    expect(premedicationPhaseOf("evening")).toBe("DAY_BEFORE")
    expect(premedicationPhaseOf("day-before")).toBe("DAY_BEFORE")
    expect(premedicationPhaseOf("morning")).toBe("MORNING")
    expect(premedicationPhaseOf("afternoon")).toBeNull()
  })
})
