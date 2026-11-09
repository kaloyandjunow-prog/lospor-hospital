import { describe, expect, it } from "vitest"
import { buildRecordEventLog, buildRecordEpisodes } from "./record-log"
import { RECORD_LABELS, recordLabels } from "./record-labels"

const log = [
  { id: "v", ts: "2026-11-07T08:01:00.000Z", type: "vital", systolic: 120, diastolic: 70 },
  { id: "p", ts: "2026-11-07T08:02:00.000Z", type: "prompt_answer", label: "Not now" },
  { id: "d2", ts: "2026-11-07T08:20:00.000Z", type: "drug", name: "Ephedrine", dose: "10", unit: "mg", suggestion: "card:Hypotension:ephedrine" },
  { id: "e1", ts: "2026-11-07T08:05:00.000Z", type: "clinical_event", label: "Induction" },
  { id: "g1", ts: "2026-11-07T08:30:00.000Z", type: "gas_change", label: "FGF 1 L/min" },
]
const deleted = [
  { id: "d1", ts: "2026-11-07T08:10:00.000Z", type: "drug", name: "Fentanyl", dose: "1000", unit: "mcg", deletedAt: "2026-11-07T08:12:00.000Z" },
]

describe("the printed record's event log", () => {
  it("lists charted entries in time order, without vitals or a Not now answer", () => {
    const rows = buildRecordEventLog(log, [], "Europe/Sofia", "en")
    expect(rows.map(r => [r.id, r.time, r.kind])).toEqual([["e1", "10:05", "event"], ["d2", "10:20", "drug"], ["g1", "10:30", "fgf"]])
  })

  it("keeps a deleted entry at the minute it was charted for, with the minute it was deleted", () => {
    const rows = buildRecordEventLog(log, deleted, "Europe/Sofia", "en")
    const gone = rows.find(r => r.id === "deleted:d1")!
    expect(rows.map(r => r.id)).toEqual(["e1", "deleted:d1", "d2", "g1"])
    expect(gone).toMatchObject({ time: "10:10", deletedTime: "10:12", kind: "drug" })
    expect(rows.filter(r => r.deletedTime).length).toBe(1)
  })

  it("names the treatment card an entry was made from, in the reader's language", () => {
    const en = buildRecordEventLog(log, [], null, "en").find(r => r.id === "d2")!
    const bg = buildRecordEventLog(log, [], null, "bg").find(r => r.id === "d2")!
    expect(en.card).toBe("Hypotension")
    expect(bg.card).toBe("Хипотенсия")
  })

  it("falls back to UTC when the case has no time zone, and survives empty input", () => {
    expect(buildRecordEventLog(log, [], null, "en")[0]!.time).toBe("08:05")
    expect(buildRecordEventLog(undefined, undefined, null, "en")).toEqual([])
  })

  it("tolerates a deleted entry that lacks its deletion time", () => {
    const rows = buildRecordEventLog([], [{ ...deleted[0]!, deletedAt: undefined }], null, "en")
    expect(rows[0]!.id).toBe("deleted:d1")
    expect(rows[0]!.deletedTime).toBeUndefined()
  })
})

describe("the record's labels", () => {
  it("carries the maintainer's Bulgarian wording and falls back to English", () => {
    expect(RECORD_LABELS.bg.access).toBe("Съдов достъп")
    expect(RECORD_LABELS.bg.eventLog).toBe("Дневник")
    expect(RECORD_LABELS.bg.deletedAt).toBe("Изтрито в")
    expect(RECORD_LABELS.bg.kinds.fgf).toBe("Поток на свежи газове")
    expect(RECORD_LABELS.en.kinds.fgf).toBe("FGF")
    expect(recordLabels("fr").title).toBe("Anaesthesia record")
    expect(recordLabels("bg").title).toBe("Анестезиологичен протокол")
  })

  it("has the same keys in both languages", () => {
    expect(Object.keys(RECORD_LABELS.bg).sort()).toEqual(Object.keys(RECORD_LABELS.en).sort())
    expect(Object.keys(RECORD_LABELS.bg.kinds).sort()).toEqual(Object.keys(RECORD_LABELS.en.kinds).sort())
  })
})

describe("the record's episodes", () => {
  const episodeLog = [
    { id: "c1", ts: "2026-11-07T08:10:00.000Z", endTs: "2026-11-07T08:25:00.000Z", type: "complication", label: "Hypotension" },
    { id: "d1", ts: "2026-11-07T08:12:00.000Z", type: "drug", name: "Ephedrine", dose: "10", unit: "mg", suggestion: "card:Hypotension:ephedrine" },
    { id: "d2", ts: "2026-11-07T08:40:00.000Z", type: "drug", name: "Fentanyl", dose: "50", unit: "mcg" },
    { id: "c2", ts: "2026-11-07T09:00:00.000Z", type: "complication", label: "Bronchospasm" },
    { id: "d3", ts: "2026-11-07T09:10:00.000Z", type: "drug", name: "Salbutamol", dose: "2", unit: "mg" },
  ]
  it("lists what was given during each episode, and only that", () => {
    const [first, second] = buildRecordEpisodes(episodeLog, "Europe/Sofia", "en")
    expect(first).toMatchObject({ id: "c1", from: "10:10", to: "10:25" })
    expect(first!.treated.map(t => [t.time, t.card])).toEqual([["10:12", true]])
    expect(second!.to).toBeUndefined()
    expect(second!.treated).toHaveLength(1)
  })
  it("gives no episodes for an empty log", () => {
    expect(buildRecordEpisodes(undefined, null, "en")).toEqual([])
  })
})
