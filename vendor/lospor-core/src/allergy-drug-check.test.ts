import { describe, expect, it } from "vitest"

import { allergyConflicts, allergyRecords, uncheckedAllergies, type AllergyRecord, type DrugIdentity } from "./allergy-drug-check"
import { DRUG_CATALOG } from "./catalog/intraop-drugs"
import { projectIntraopEvents } from "./intraop-engine"
import { applyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import { parseLogEvents, type LogEvent, type TimetableData } from "./intraop-types"

/** A drug exactly as the theatre catalogue records it. */
function drug(name: string): DrugIdentity {
  const entry = DRUG_CATALOG.find(candidate => candidate.name.toLowerCase().includes(name.toLowerCase()))
  if (!entry) throw new Error(`no catalogue drug ${name}`)
  return { name: entry.name, atcCode: entry.atcCode }
}

const level = (allergy: AllergyRecord, given: DrugIdentity) => allergyConflicts([allergy], given)[0]?.level ?? null

describe("an allergy picked from the medication list", () => {
  const amoxicillin: AllergyRecord = { label: "Amoxicillin", inn: "amoxicillin", atcCode: "J01CA04" }

  it("matches the same substance", () => {
    expect(level({ label: "Cefazolin", atcCode: "J01DB04" }, drug("Cefazolin"))).toBe("same_substance")
  })

  it("matches another drug of the same class strongly", () => {
    expect(level(amoxicillin, drug("Piperacillin"))).toBe("same_class")
    expect(level(amoxicillin, drug("Ampicillin-sulbactam"))).toBe("same_class")
  })

  it("cautions across penicillins and cephalosporins or carbapenems", () => {
    expect(level(amoxicillin, drug("Cefazolin"))).toBe("cross_reaction")
    expect(level(amoxicillin, drug("Meropenem"))).toBe("cross_reaction")
  })

  it("cautions between ceftazidime and aztreonam, which share a side chain", () => {
    expect(level({ label: "Ceftazidime", atcCode: "J01DD02" }, drug("Aztreonam"))).toBe("cross_reaction")
  })

  it("leaves an unrelated drug alone", () => {
    expect(level(amoxicillin, drug("Propofol"))).toBeNull()
    expect(level(amoxicillin, drug("Vancomycin"))).toBeNull()
  })
})

describe("the anaesthetic families", () => {
  it("keeps amide and ester local anaesthetics apart", () => {
    expect(level({ label: "Lidocaine", atcCode: "N01BB02" }, drug("Bupivacaine"))).toBe("same_class")
    expect(level({ label: "Lidocaine", atcCode: "N01BB02" }, drug("Chloroprocaine"))).toBeNull()
  })

  it("cautions across every muscle relaxant, and warns strongly inside a family", () => {
    expect(level({ label: "Rocuronium", atcCode: "M03AC09" }, drug("Vecuronium"))).toBe("same_class")
    expect(level({ label: "Rocuronium", atcCode: "M03AC09" }, drug("Cisatracurium"))).toBe("cross_reaction")
    expect(level({ label: "Rocuronium", atcCode: "M03AC09" }, drug("Succinylcholine"))).toBe("cross_reaction")
  })

  it("does not warn one opioid family against another", () => {
    expect(level({ label: "Morphine", atcCode: "N02AA01" }, drug("Oxycodone"))).toBe("same_class")
    expect(level({ label: "Morphine", atcCode: "N02AA01" }, drug("Fentanyl"))).toBeNull()
  })

  it("treats NSAIDs as one class, with coxibs and metamizole as cautions", () => {
    expect(level({ label: "Aspirin", atcCode: "N02BA01" }, drug("Ketorolac"))).toBe("same_class")
    expect(level({ label: "Ibuprofen", atcCode: "M01AE01" }, drug("Parecoxib"))).toBe("cross_reaction")
    expect(level({ label: "Ibuprofen", atcCode: "M01AE01" }, drug("Metamizole"))).toBe("cross_reaction")
  })

  it("does not warn the deliberately excluded pairs", () => {
    expect(level({ label: "Sulfamethoxazole", atcCode: "J01EC01" }, drug("Furosemide"))).toBeNull()
    expect(level({ label: "яйца" }, drug("Propofol"))).toBeNull()
    expect(level({ label: "соя" }, drug("Propofol"))).toBeNull()
  })
})

describe("a typed allergy", () => {
  it("is read in Bulgarian and English", () => {
    expect(level({ label: "пеницилин" }, drug("Ampicillin"))).toBe("same_class")
    expect(level({ label: "Penicillin allergy" }, drug("Ceftriaxone"))).toBe("cross_reaction")
    expect(level({ label: "НСПВС" }, drug("Diclofenac"))).toBe("same_class")
    expect(level({ label: "аналгин" }, drug("Metamizole"))).toBe("same_class")
    expect(level({ label: "новокаин" }, drug("Tetracaine"))).toBe("same_class")
  })

  it("takes \"muscle relaxants\" to mean every one", () => {
    expect(level({ label: "мускулни релаксанти" }, drug("Atracurium"))).toBe("same_class")
    expect(level({ label: "Muscle relaxant" }, drug("Rocuronium"))).toBe("same_class")
  })

  it("takes \"opioids\" to mean morphine and its family, not fentanyl", () => {
    expect(level({ label: "опиати" }, drug("Morphine"))).toBe("same_class")
    expect(level({ label: "опиати" }, drug("Remifentanil"))).toBeNull()
  })

  it("cautions protamine against a fish allergy", () => {
    expect(level({ label: "риба" }, drug("Protamine"))).toBe("cross_reaction")
  })

  it("matches a drug it names exactly", () => {
    expect(level({ label: "Paracetamol" }, drug("Paracetamol"))).toBe("same_substance")
  })
})

describe("what cannot be checked is said", () => {
  it("lists allergies with no code, no known word and no catalogue name", () => {
    expect(uncheckedAllergies([
      { label: "the blue pills" },
      { label: "пеницилин" },
      { label: "Paracetamol" },
      { label: "Cefazolin", atcCode: "J01DB04" },
    ])).toEqual(["the blue pills"])
  })
})

describe("reading the allergies a case records", () => {
  it("takes picked items, typed text and the hospital's own", () => {
    expect(allergyRecords({
      allergies: true,
      allergyDetails: [
        { label: "Amoxicillin", inn: "amoxicillin", atcCode: "J01CA04", source: "ehr" },
        "латекс",
      ],
    })).toEqual([
      { label: "Amoxicillin", inn: "amoxicillin", atcCode: "J01CA04", source: "ehr" },
      { label: "латекс" },
    ])
  })

  it("reads nothing when the case records no known allergies", () => {
    expect(allergyRecords({ allergies: false, allergyDetails: [{ label: "x" }] })).toEqual([])
  })

  it("orders several matches strongest first and keeps where each came from", () => {
    const found = allergyConflicts([
      { label: "Penicillin", source: "typed" },
      { label: "Cefazolin", atcCode: "J01DB04", source: "ehr" },
    ], drug("Cefazolin"))
    expect(found.map(conflict => [conflict.level, conflict.source])).toEqual([
      ["same_substance", "ehr"],
      ["cross_reaction", "typed"],
    ])
  })
})


describe("an acknowledgement stays on the dose it was given for", () => {
  const start = new Date("2026-10-04T08:00:00Z")
  const ack = [{ allergy: "Penicillin", level: "cross_reaction" as const }]

  it("survives the chart edit, the server's parse and the projection back", () => {
    const before = projectIntraopEvents([], { start, openThrough: start })
    const after: TimetableData = {
      ...before,
      drugs: [{ colIdx: 2, name: "Cefazolin", dose: "2", unit: "g", atcCode: "J01DB04", allergyAck: ack }],
    }
    const ops = timetableEditToEventOps({ log: [], before, after, chartStart: start, now: new Date("2026-10-04T08:30:00Z"), newId: () => "d1" })
    expect(ops.add[0]).toMatchObject({ type: "drug", allergyAck: ack })

    const stored = parseLogEvents(JSON.parse(JSON.stringify(applyIntraopEventOps([], ops)))) as LogEvent[]
    expect(stored[0].allergyAck).toEqual(ack)

    const chart = projectIntraopEvents(stored, { start, openThrough: new Date("2026-10-04T08:30:00Z") })
    expect(chart.drugs[0].allergyAck).toEqual(ack)
  })

  it("is dropped, not trusted, when a client sends a malformed one", () => {
    const parsed = parseLogEvents([{ id: "x", ts: "2026-10-04T08:10:00Z", type: "drug", name: "Cefazolin", allergyAck: [{ allergy: "P", level: "whatever" }, "junk"] }])
    expect(parsed[0].allergyAck).toBeUndefined()
  })
})
