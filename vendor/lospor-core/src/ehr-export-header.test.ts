import { describe, expect, it } from "vitest"

import { buildCodedHeader, quantity } from "./ehr-export-header"

const FINAL = { sequence: 1, finalizedAt: "2026-09-02T10:00:00.000Z" }

type HeaderInput = Parameters<typeof buildCodedHeader>[0]

function header(input: Partial<HeaderInput> = {}) {
  return buildCodedHeader({ ...input, finalization: input.finalization ?? FINAL })
}

describe("a figure nobody recorded is not zero", () => {
  // The discipline this whole header is built around. "Blood loss 0 mL" is a
  // clinical finding — it says somebody looked. Sending it for a case nobody
  // measured puts a finding in the hospital record that no one ever made.

  it("reports an unrecorded blood loss as unrecorded, not as 0", () => {
    const result = header({ intraop: { bloodLossMl: null } })

    expect(result.fluids.bloodLoss).toEqual({ recorded: false, unit: "mL" })
    expect(result.fluids.bloodLoss).not.toHaveProperty("value")
  })

  it("reports a measured zero as a measured zero", () => {
    const result = header({ intraop: { bloodLossMl: 0 } })

    expect(result.fluids.bloodLoss).toEqual({ recorded: true, value: 0, unit: "mL" })
  })

  it("keeps the same distinction for urine", () => {
    expect(header({ intraop: { urineMl: 0 } }).fluids.urine)
      .toEqual({ recorded: true, value: 0, unit: "mL" })
    expect(header({ intraop: {} }).fluids.urine)
      .toEqual({ recorded: false, unit: "mL" })
  })

  it("does not report an empty chart as measured zeros", () => {
    // A total of 0 computed from a chart with nothing in it says nothing was
    // charted, not that nothing was given.
    const result = header({ intraop: {} })

    expect(result.fluids.crystalloids.recorded).toBe(false)
    expect(result.fluids.colloids.recorded).toBe(false)
    expect(result.fluids.blood.recorded).toBe(false)
  })

  it("reports computed totals as recorded, including a genuine zero", () => {
    const result = header({ fluidTotals: { crystalloids: 1500, colloids: 0, blood: 0 } })

    expect(result.fluids.crystalloids).toEqual({ recorded: true, value: 1500, unit: "mL" })
    expect(result.fluids.colloids).toEqual({ recorded: true, value: 0, unit: "mL" })
  })

  it("treats a non-finite number as unrecorded rather than sending NaN", () => {
    expect(quantity(Number.NaN, "mL")).toEqual({ recorded: false, unit: "mL" })
    expect(quantity(Number.POSITIVE_INFINITY, "mL")).toEqual({ recorded: false, unit: "mL" })
  })

  it("applies the same rule to the Aldrete score", () => {
    expect(header({ postop: { aldreteTotal: 0 } }).handover.aldreteTotal)
      .toEqual({ recorded: true, value: 0, unit: "score" })
    expect(header({ postop: {} }).handover.aldreteTotal.recorded).toBe(false)
  })
})

describe("drug totals carry how many doses made them", () => {
  it("keeps the count, because three doses is a different anaesthetic", () => {
    // "3 × 2 mg" and one 6 mg dose are the same total and not the same thing.
    const result = header({
      drugTotals: [{ name: "Morphine", unit: "mg", total: 6, count: 3 }],
    })

    expect(result.drugs).toEqual([{ name: "Morphine", unit: "mg", total: 6, count: 3 }])
  })

  it("sends an empty list when nothing was given", () => {
    expect(header({}).drugs).toEqual([])
  })
})

describe("complications keep their codes, and the uncoded ones still go", () => {
  it("preserves the source vocabulary and concept", () => {
    const result = header({
      intraop: {
        complications: [{
          label: "Laryngospasm",
          sourceVocabulary: "SNOMED",
          sourceCode: "79890006",
          standardConceptId: 4103317,
        }],
      },
    })

    expect(result.complications[0]).toEqual({
      label: "Laryngospasm",
      sourceVocabulary: "SNOMED",
      sourceCode: "79890006",
      standardConceptId: 4103317,
    })
  })

  it("sends an uncoded complication rather than dropping it", () => {
    // The unusual events are the ones least likely to be in a picklist, and
    // they are the ones a receiving clinician most needs to see.
    expect(header({ intraop: { complications: "Unexpected difficult ventilation" } }).complications)
      .toEqual([{ label: "Unexpected difficult ventilation" }])
  })

  it("sends theatre and recovery complications both, as separate events", () => {
    const result = header({
      intraop: { complications: "Laryngospasm" },
      postop: { complications: "PONV" },
    })

    expect(result.complications.map(c => c.label)).toEqual(["Laryngospasm", "PONV"])
  })

  it("survives unparseable stored text", () => {
    expect(header({ intraop: { complications: "[not json" } }).complications)
      .toEqual([{ label: "[not json" }])
  })

  it("reports none when there were none", () => {
    expect(header({ intraop: { complications: null }, postop: { complications: "" } }).complications)
      .toEqual([])
  })
})

describe("the header says which finalisation it describes", () => {
  it("carries the sequence so a correction supersedes cleanly", () => {
    const result = buildCodedHeader({
      finalization: { sequence: 2, finalizedAt: "2026-09-02T11:00:00.000Z", supersedes: "fin-1" },
    })

    expect(result.finalization).toEqual({
      sequence: 2,
      finalizedAt: "2026-09-02T11:00:00.000Z",
      supersedes: "fin-1",
    })
  })

  it("carries the times with their zone rather than a bare clock reading", () => {
    const result = header({
      intraop: {
        startedAt: "2026-09-02T07:30:00.000Z",
        endedAt: "2026-09-02T09:15:00.000Z",
        timezone: "Europe/Sofia",
      },
    })

    expect(result.times).toEqual({
      startedAt: "2026-09-02T07:30:00.000Z",
      endedAt: "2026-09-02T09:15:00.000Z",
      timezone: "Europe/Sofia",
    })
  })

  it("says null rather than inventing times for a case that has none", () => {
    expect(header({}).times).toEqual({ startedAt: null, endedAt: null, timezone: null })
  })
})

describe("handover", () => {
  it("carries the disposition and the items verbatim", () => {
    const result = header({
      postop: {
        disposition: "WARD",
        handoverItems: ["Oxygen 2 L/min", "Analgesia given at 09:10", ""],
      },
    })

    expect(result.handover.disposition).toBe("WARD")
    expect(result.handover.items).toEqual(["Oxygen 2 L/min", "Analgesia given at 09:10"])
  })

  it("reports no disposition rather than guessing one", () => {
    expect(header({}).handover.disposition).toBeNull()
    expect(header({}).handover.items).toEqual([])
  })
})
