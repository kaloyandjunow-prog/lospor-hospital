import { describe, expect, it } from "vitest"
import { DEFAULT_INTRAOP_AUTOMATION } from "./intraop-automation"
import {
  SEED_SUCCESSION, SEQUENCE_EVENTS, SUCCESSION_ANSWER_KIND, SUCCESSION_DISMISS_ANSWER, SUCCESSION_MIN_CASES, buildSuccessionStats, likelyNext, mergeSuccession, successionAutomationId, successionContext, successionDismissedIds, successionEvidence,
  type SuccessionCase, type SuccessionLink,
} from "./event-succession"

const T0 = Date.parse("2026-11-03T08:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const general = successionContext(["GENERAL_TIVA"], false)
const ENABLED = { ...DEFAULT_INTRAOP_AUTOMATION, enabled: true, groups: { ...DEFAULT_INTRAOP_AUTOMATION.groups, reminders: true } }
const next = (log: Array<{ label: string; ts: string }>, minutes: number, over: Partial<Parameters<typeof likelyNext>[0]> = {}) =>
  likelyNext({ log, context: general, links: SEED_SUCCESSION, now: at(minutes), settings: ENABLED, ...over })

describe("the context that sets the order of events", () => {
  it("a general anaesthetic decides it whatever else is on the list, then neuraxial, block, sedation", () => {
    expect(successionContext(["BLOCK_FEMORAL", "GENERAL_TIVA"], false)).toEqual({ family: "general", child: false })
    expect(successionContext(["SPINAL_SINGLE_LUMBAR", "BLOCK_TAP"], true)).toEqual({ family: "neuraxial", child: true })
    expect(successionContext(["BLOCK_TAP"], false).family).toBe("block")
    expect(successionContext(["SEDATION_MAC"], false).family).toBe("sedation")
    expect(successionContext([], false).family).toBe("other")
  })

  it("does not learn complications or resuscitation events", () => {
    expect(SEQUENCE_EVENTS.has("Incision")).toBe(true)
    expect(SEQUENCE_EVENTS.has("Hypotension")).toBe(false)
    expect(SEQUENCE_EVENTS.has("CPR started")).toBe(false)
  })
})

describe("counting how events were logged", () => {
  const caseOf = (events: Array<[string, number]>, context = general): SuccessionCase => ({ context, events: events.map(([label, minutes]) => ({ label, ts: at(minutes) })) })

  it("counts what followed each event, once per case, with the usual gap", () => {
    const links = buildSuccessionStats([
      caseOf([["Positioned", 0], ["Incision", 4]]), caseOf([["Positioned", 0], ["Incision", 6]]), caseOf([["Positioned", 0], ["Incision", 5]]), caseOf([["Positioned", 0]]),
    ])
    expect(links).toEqual([{ context: "general", from: "Positioned", to: "Incision", count: 3, total: 4, gapMinutes: 5 }])
  })

  it("takes the next different event, counts a repeated event once, and ignores complications", () => {
    const links = buildSuccessionStats([caseOf([["Induction", 0], ["Hypotension", 1], ["Induction", 2], ["Intubated", 3]])])
    expect(links).toEqual([{ context: "general", from: "Induction", to: "Intubated", count: 1, total: 1, gapMinutes: 3 }])
  })

  it("normalizes structured airway and vascular records once, beside existing clinical events", () => {
    const ts = at(1)
    const evidence = successionEvidence(
      [{ label: "Intubated", ts }],
      {
        airway: [{ device: "ORAL_ETT", insertedAt: ts, status: "in_use" }],
        vascular: [{ type: "VENOUS", site: "VEN_PERIPHERAL", insertedAt: at(2), preexisting: false }],
      },
    )
    expect(evidence).toEqual([{ label: "Intubated", ts }, { label: "IV line in", ts: at(2) }])
  })

  it("deduplicates structured and event evidence when their clocks differ by milliseconds", () => {
    const evidence = successionEvidence(
      [{ label: "Intubated", ts: at(1) }],
      { airway: [{ device: "ORAL_ETT", insertedAt: new Date(T0 + 60_000 + 500).toISOString(), status: "in_use" }] },
    )
    expect(evidence).toEqual([{ label: "Intubated", ts: at(1) }])
  })

  it("uses the stable source id when linked records do not share an exact timestamp", () => {
    const evidence = successionEvidence(
      [{ id: "airway-event-1", label: "Intubated", ts: at(1) }],
      { airway: [{ device: "ORAL_ETT", insertedAt: new Date(T0 + 61_500).toISOString(), status: "in_use", sourceEventId: "airway-event-1" }] },
    )
    expect(evidence).toEqual([{ id: "airway-event-1", label: "Intubated", ts: at(1) }])
  })

  it("keeps genuinely separate repeated clinical airway events", () => {
    const evidence = successionEvidence(
      [{ label: "Intubated", ts: at(1) }],
      { airway: [{ device: "ORAL_ETT", insertedAt: at(2), status: "replaced" }] },
    )
    expect(evidence).toEqual([{ label: "Intubated", ts: at(1) }, { label: "Reintubation", ts: at(2) }])
  })

  it("does not let a structured event in the future count as already charted", () => {
    const result = next([{ label: "Positioned", ts: at(0) }], 6, { structured: { airway: [{ device: "ORAL_ETT", insertedAt: at(30), status: "in_use" }] } })
    expect(result.map(item => item.event)).toEqual(["Incision"])
  })

  it("keeps each context apart", () => {
    const links = buildSuccessionStats([caseOf([["Positioned", 0], ["Incision", 4]]), caseOf([["Positioned", 0], ["Incision", 20]], successionContext(["SPINAL_SINGLE_LUMBAR"], false))])
    expect(links.map(link => [link.context, link.gapMinutes])).toEqual(expect.arrayContaining([["general", 4], ["neuraxial", 20]]))
  })
})

describe("starting values give way to what the cases show", () => {
  const learned = (count: number, total: number): SuccessionLink[] => [{ context: "general", from: "Positioned", to: "Incision", count, total, gapMinutes: 12 }]

  it("keeps the starting values until a starting event has been seen often enough", () => {
    const merged = mergeSuccession(SEED_SUCCESSION, learned(8, SUCCESSION_MIN_CASES - 1))
    expect(merged.find(link => link.context === "general" && link.from === "Positioned")).toMatchObject({ gapMinutes: 5 })
  })

  it("replaces all the starting links of that event, and only that event", () => {
    const merged = mergeSuccession(SEED_SUCCESSION, learned(20, SUCCESSION_MIN_CASES))
    expect(merged.find(link => link.context === "general" && link.from === "Positioned")).toMatchObject({ gapMinutes: 12, count: 20 })
    expect(merged.filter(link => link.context === "general" && link.from === "Positioned")).toHaveLength(1)
    expect(merged.find(link => link.context === "general" && link.from === "Induction")).toBeDefined()
  })
})

describe("what is likely now", () => {
  it("suggests Incision once the usual gap has passed after Positioned", () => {
    const log = [{ label: "Positioned", ts: at(0) }]
    expect(next(log, 3)).toEqual([])
    expect(next(log, 6)).toEqual([expect.objectContaining({ event: "Incision", from: "Positioned", probability: 0.9 })])
  })

  it("does not suggest an event that is already charted", () => {
    expect(next([{ label: "Positioned", ts: at(0) }, { label: "Incision", ts: at(1) }], 10)).toEqual([])
    expect(next([{ label: "Incision", ts: at(-5) }, { label: "Positioned", ts: at(0) }], 10)).toEqual([])
  })

  it("does not offer an event already planned later in the case", () => {
    expect(next([{ label: "Positioned", ts: at(0) }, { label: "Incision", ts: at(30) }], 10)).toEqual([])
  })

  it("offers the likeliest after Induction, most likely first, and not the unlikely ones", () => {
    const log = [{ label: "Induction", ts: at(0) }]
    expect(next(log, 4).map(item => item.event)).toEqual(["Intubated"])
    expect(next(log, 4, { minProbability: 0.25 }).map(item => item.event)).toEqual(["Intubated", "LMA in"])
  })

  it("is quiet when the last charted event leads nowhere due, rather than reaching back", () => {
    expect(next([{ label: "Positioned", ts: at(0) }, { label: "Art line in", ts: at(2) }], 4)).toEqual([])
  })

  it("looks back past an event with no links to one that has", () => {
    expect(next([{ label: "Positioned", ts: at(0) }, { label: "Art line in", ts: at(2) }], 9).map(item => item.event)).toEqual(["Incision"])
  })

  it("leaves out what was set aside, what Status switched off, and everything when the group is off", () => {
    const log = [{ label: "Positioned", ts: at(0) }]
    expect(next(log, 8, { dismissed: [successionAutomationId("Positioned", "Incision")] })).toEqual([])
    expect(next(log, 8, { settings: { ...ENABLED, disabled: [successionAutomationId("Positioned", "Incision")] } })).toEqual([])
    expect(next(log, 8, { settings: { ...DEFAULT_INTRAOP_AUTOMATION, groups: { ...DEFAULT_INTRAOP_AUTOMATION.groups, reminders: false } } })).toEqual([])
    // The reminders are on by default, so a hospital that never opened Status still gets them.
    expect(next(log, 8, { settings: DEFAULT_INTRAOP_AUTOMATION }).map(item => item.event)).toEqual(["Incision"])
  })

  it("reconstructs a definitive succession dismissal and accepts old records for compatibility", () => {
    const id = successionAutomationId("Positioned", "Incision")
    expect(successionDismissedIds([
      { type: "prompt_answer", answerKind: SUCCESSION_ANSWER_KIND, answerFor: id, answer: SUCCESSION_DISMISS_ANSWER },
      { type: "prompt_answer", answerKind: SUCCESSION_ANSWER_KIND, answerFor: "succession:Induction>Intubated", answer: "not_now" },
      { type: "prompt_answer", answerKind: "reading:hr", answerFor: id, answer: "not_now" },
    ])).toEqual([id, "succession:Induction>Intubated"])
  })

  it("uses the order of the technique: neuraxial waits longer for the incision", () => {
    const neuraxial = successionContext(["SPINAL_SINGLE_LUMBAR"], false)
    const log = [{ label: "Positioned", ts: at(0) }]
    expect(next(log, 6, { context: neuraxial })).toEqual([])
    expect(next(log, 9, { context: neuraxial }).map(item => item.event)).toEqual(["Incision"])
  })

  it("gives no more than the limit and ignores events in the future", () => {
    expect(next([{ label: "Induction", ts: at(0) }], 4, { limit: 1 })).toHaveLength(1)
    expect(next([{ label: "Positioned", ts: at(30) }], 4)).toEqual([])
  })
})

describe("links read from the server", () => {
  it("keeps well-formed links and drops the rest", async () => {
    const { parseSuccessionLinks } = await import("./event-succession")
    const good = { context: "general", from: "Positioned", to: "Incision", count: 9, total: 10, gapMinutes: 5 }
    expect(parseSuccessionLinks([good, { ...good, from: "Hypotension" }, { ...good, count: 11 }, { ...good, total: 0 }, { ...good, gapMinutes: -1 }, "x", null, { ...good, to: 5 }])).toEqual([good])
    expect(parseSuccessionLinks("nope")).toEqual([])
  })
})
