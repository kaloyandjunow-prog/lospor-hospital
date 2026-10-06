import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { redactEventFreeText, redactExportRow } from "@/lib/omop-export-source"

type Row = Parameters<typeof redactExportRow>[0]

function exportRow(): Row {
  return {
    preop: {
      diagnosis: "Appendicitis, seen by Dr Petrov",
      plannedProcedure: "Laparoscopic appendectomy",
      allergyDetails: "penicillin rash",
      currentMedications: "metformin",
      familyAnesthesiaDetails: "brother had trouble waking",
      difficultAirwayNotes: "short neck",
      medications: [{ nameRaw: "Aspirin 100mg", inn: "acetylsalicylic acid", atcCode: "B01AC06" }],
    },
    events: [{ label: "line inserted", value: "left radial" }],
    complications: [{ note: "brief desaturation" }],
    intraop: {
      complications: "none",
      premedicationEvening: "diazepam",
      premedicationMorning: "none",
      keyEvents: { log: [{ id: "e1", note: "patient anxious" }] },
      premedicationRows: [{ nameRaw: "Midazolam 2mg" }],
    },
  } as unknown as Row
}

describe("the export policy's free-text control", () => {
  // Administrators have been offered this setting since 1.0.0. It was
  // validated, persisted and audit-logged, and nothing read it: free text was
  // redacted and sent whatever the answer. Switching it off appeared to work.

  it("sends redacted free text when the policy allows it", () => {
    const row = redactExportRow(exportRow(), { includeRedactedText: true })
    expect(row.preop?.plannedProcedure).toBe("Laparoscopic appendectomy")
    expect(row.intraop?.premedicationEvening).toBe("diazepam")
    expect(row.events[0].label).toBe("line inserted")
  })

  it("defaults to allowing it, so an unset policy behaves as before", () => {
    const row = redactExportRow(exportRow())
    expect(row.preop?.plannedProcedure).toBe("Laparoscopic appendectomy")
    expect(row.complications[0].note).toBe("brief desaturation")
  })

  it("drops every free-text field when the policy refuses it", () => {
    const row = redactExportRow(exportRow(), { includeRedactedText: false })
    expect(row.preop?.allergyDetails).toBeNull()
    expect(row.preop?.currentMedications).toBeNull()
    expect(row.preop?.familyAnesthesiaDetails).toBeNull()
    expect(row.preop?.difficultAirwayNotes).toBeNull()
    expect(row.intraop?.complications).toBeNull()
    expect(row.intraop?.premedicationEvening).toBeNull()
    expect(row.intraop?.premedicationMorning).toBeNull()
    expect(row.events[0].label).toBeNull()
    expect(row.events[0].value).toBeNull()
    expect(row.complications[0].note).toBeNull()
  })

  it("empties, rather than drops, the fields the export types as required", () => {
    const row = redactExportRow(exportRow(), { includeRedactedText: false })
    expect(row.preop?.diagnosis).toBe("")
    expect(row.preop?.plannedProcedure).toBe("")
    expect(row.preop?.medications[0].nameRaw).toBe("")
    expect(row.intraop?.premedicationRows[0].nameRaw).toBe("")
  })

  it("empties the freeform timetable without removing the record around it", () => {
    // Dropping keyEvents entirely would take the structured intraoperative
    // record with it, which is the clinical substance of the export.
    const row = redactExportRow(exportRow(), { includeRedactedText: false })
    expect(row.intraop?.keyEvents).toEqual({})
    expect(row.intraop).not.toBeNull()
  })

  it("leaves coded fields alone in both directions", () => {
    // Vocabulary entries are not prose. Dropping them would empty the export of
    // the clinical content it exists to carry.
    for (const includeRedactedText of [true, false]) {
      const row = redactExportRow(exportRow(), { includeRedactedText })
      expect(row.preop?.medications[0].atcCode).toBe("B01AC06")
      expect(row.preop?.medications[0].inn).toBe("acetylsalicylic acid")
    }
  })

  it("takes options as its second argument, not an array index", () => {
    // `rows.map(redactExportRow)` would hand map's index to `options`. It reads
    // as a no-op and silently disables the control on whichever rows are not
    // at index 0.
    const rows = [exportRow(), exportRow()]
    const mapped = rows.map(row => redactExportRow(row, { includeRedactedText: false }))
    expect(mapped.every(row => row.preop?.allergyDetails === null)).toBe(true)
  })
})

// --- From lospor-api 9.14.2: free text only, coded fields pass through. ---
// 9.14.2: identifying text is no longer refused at save on a hospital
// appliance, so the export is where it is cleaned -- in free text only.
const row914 = {
  id: "c1",
  preop: {
    diagnosis: "Acute Cholecystitis",
    plannedProcedure: "Laparoscopic Cholecystectomy",
    allergyDetails: "Benzylpenicillin Krka",
    currentMedications: "Co-Diovan Novartis",
    familyAnesthesiaDetails: "Майка Мария Иванова, реакция 12.03.1990",
    difficultAirwayNotes: "ЕГН 7501020018 в бележката",
    medications: [{ nameRaw: "Sodium Chloride" }],
  },
  events: [{ label: "Propofol Fresenius", value: "Обадете се на Петър Георгиев" }],
  complications: [{ note: "имейл pacient@example.com" }],
  intraop: {
    complications: "Без Особености",
    premedicationEvening: "Midazolam",
    premedicationMorning: null,
    keyEvents: { log: [
      { id: "e1", type: "drug", name: "Sodium Chloride", unit: "mL", note: "дадено от Анна Петрова" },
      { id: "e2", type: "clinical_event", label: "Anaesthesia start" },
    ] },
    premedicationRows: [{ nameRaw: "Midazolam Roche" }],
  },
} as unknown as Row

describe("the OMOP export cleans free text only", () => {
  const out = redactExportRow(row914) as unknown as typeof row914 & Record<string, never>
  const preop = (out as unknown as { preop: Record<string, unknown> }).preop
  const intraop = (out as unknown as { intraop: Record<string, unknown> }).intraop

  it("passes coded vocabulary through untouched", () => {
    expect(preop.diagnosis).toBe("Acute Cholecystitis")
    expect(preop.plannedProcedure).toBe("Laparoscopic Cholecystectomy")
    expect(preop.allergyDetails).toBe("Benzylpenicillin Krka")
    expect(preop.currentMedications).toBe("Co-Diovan Novartis")
    expect((preop.medications as { nameRaw: string }[])[0].nameRaw).toBe("Sodium Chloride")
    expect((out as unknown as { events: { label: string }[] }).events[0].label).toBe("Propofol Fresenius")
    expect((intraop.premedicationRows as { nameRaw: string }[])[0].nameRaw).toBe("Midazolam Roche")
  })

  it("cleans names, dates, ЕГН and email in free text", () => {
    expect(preop.familyAnesthesiaDetails).not.toMatch(/Мария Иванова|12\.03\.1990/)
    expect(preop.difficultAirwayNotes).not.toContain("7501020018")
    expect((out as unknown as { events: { value: string }[] }).events[0].value).not.toContain("Петър Георгиев")
    expect((out as unknown as { complications: { note: string }[] }).complications[0].note).not.toContain("@")
  })

  it("cleans only the typed parts of the event log", () => {
    const log = (intraop.keyEvents as { log: Record<string, unknown>[] }).log
    expect(log[0]).toMatchObject({ name: "Sodium Chloride", unit: "mL" })
    expect(log[0].note).not.toContain("Анна Петрова")
    expect(log[1]).toEqual({ id: "e2", type: "clinical_event", label: "Anaesthesia start" })
  })

  it("accepts a bare event array and leaves other shapes alone", () => {
    expect(redactEventFreeText([{ name: "Propofol Fresenius", comment: "Иван Петров" }]))
      .toEqual([{ name: "Propofol Fresenius", comment: "[REDACTED]" }])
    expect(redactEventFreeText(null)).toBeNull()
  })
})
