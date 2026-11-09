import { describe, expect, it } from "vitest"
import type { LogEvent } from "../intraop-types"
import { addOutcomes, suggestionOutcomes } from "./acceptance"
import { cardSuggestionTag } from "./waiting"

const T = "2026-11-02T10:00:00.000Z"
const complication = (id: string, label: string, extra: Partial<LogEvent> = {}): LogEvent => ({ id, ts: T, type: "complication", label, ...extra })
const answer = (kind: string, answerFor: string, value: "not_now" | "done" = "not_now"): LogEvent => ({ id: `pa-${kind}-${answerFor}`, ts: T, type: "prompt_answer", answerKind: kind, answerFor, answer: value })

describe("what became of the suggestions on a case", () => {
  it("counts a yes to a question as accepted and a Not now as dismissed, under the rule's own id", () => {
    const log = [
      complication("rq-lipid-1", "Local anaesthetic systemic toxicity (LAST)", { suggestion: "reverse:lipid", complicationSource: "suggestion" }),
      answer("reverse:adenosine", "d2"),
      complication("lq-hyperkalaemia-1", "Hyperkalaemia", { suggestion: "lab:hyperkalaemia" }),
      answer("reading:hypoxaemia", "r1"),
      answer("lab:troponin", "x"),
    ]
    expect(suggestionOutcomes(log)).toEqual([
      { id: "reverse:lipid", outcome: "accepted" },
      { id: "reverse:adenosine", outcome: "dismissed" },
      { id: "lab:hyperkalaemia", outcome: "accepted" },
      { id: "reading:hypoxaemia", outcome: "dismissed" },
      { id: "lab:troponin", outcome: "dismissed" },
    ])
  })

  it("counts a card once however many of its rows were used, and not as dismissed after use", () => {
    const log = [
      complication("c1", "Hypotension"),
      { id: "d1", ts: T, type: "drug", name: "Ephedrine", suggestion: cardSuggestionTag("Hypotension", "ephedrine") },
      { id: "d2", ts: T, type: "drug", name: "Phenylephrine", suggestion: cardSuggestionTag("Hypotension", "phenylephrine") },
      answer("card", "c1"),
    ] as LogEvent[]
    expect(suggestionOutcomes(log)).toEqual([{ id: "card:Hypotension", outcome: "accepted" }])
  })

  it("counts a card closed with Not now and nothing given as dismissed; Done as accepted", () => {
    expect(suggestionOutcomes([complication("c1", "Hypotension"), answer("card", "c1")])).toEqual([{ id: "card:Hypotension", outcome: "dismissed" }])
    expect(suggestionOutcomes([complication("c1", "Hypotension"), answer("card", "c1", "done")])).toEqual([{ id: "card:Hypotension", outcome: "accepted" }])
  })

  it("counts succession provenance as accepted and a case-scoped dismissal as dismissed", () => {
    const id = "succession:Positioned>Incision"
    expect(suggestionOutcomes([
      complication("incision", "Incision", { type: "clinical_event", suggestion: id }),
      { id: "dismissed", ts: T, type: "prompt_answer", answerKind: "succession", answerFor: id, suggestion: id, answer: "dismissed" },
    ] as LogEvent[])).toEqual([{ id, outcome: "accepted" }, { id, outcome: "dismissed" }])
    expect(suggestionOutcomes([
      { id: "dismissed", ts: T, type: "prompt_answer", answerKind: "succession", answerFor: id, suggestion: id, answer: "dismissed" },
    ])).toEqual([{ id, outcome: "dismissed" }])
  })

  it("counts learned succession ids, not only seeded rules", () => {
    const id = "succession:Intubated>IV line in"
    expect(suggestionOutcomes([
      { id: "iv", ts: T, type: "clinical_event", label: "IV line in", suggestion: id },
      { id: "dismissed", ts: T, type: "prompt_answer", answerKind: "succession", answerFor: id, suggestion: id, answer: "not_now" },
    ])).toEqual([{ id, outcome: "accepted" }, { id, outcome: "dismissed" }])
  })

  it("counts vital-question acceptance and dismissal under the individual vital line", () => {
    expect(suggestionOutcomes([
      complication("h", "Hypotension", { suggestion: "vital:hypotension", complicationSource: "vitals" }),
      answer("hypotension", "r1"),
    ])).toEqual([
      { id: "vital:hypotension", outcome: "accepted" },
      { id: "vital:hypotension", outcome: "dismissed" },
    ])
  })

  it("does not count a negative context answer as accepted", () => {
    expect(suggestionOutcomes([
      {
        id: "context-no",
        ts: T,
        type: "prompt_answer",
        answerKind: "context:epidural-local-anaesthetic",
        answerFor: "drug-1",
        answer: "done",
        value: "no",
      },
      {
        id: "context-dismissed",
        ts: T,
        type: "prompt_answer",
        answerKind: "context:perineural-local-anaesthetic",
        answerFor: "drug-2",
        answer: "dismissed",
      },
    ])).toEqual([{ id: "context:perineural-local-anaesthetic", outcome: "dismissed" }])
  })

  it("sees a follow-up and a reminder only when put away, and ignores what it does not know", () => {
    const log = [answer("timer:arrestAdrenaline", "k"), answer("reminder:ponv", "t"), answer("vitals:hr", "v"), { id: "e", ts: T, type: "drug", name: "Ephedrine", suggestion: "somethingelse" }] as LogEvent[]
    expect(suggestionOutcomes(log)).toEqual([{ id: "timer:arrest", outcome: "dismissed" }, { id: "reminder:ponv", outcome: "dismissed" }])
  })

  it("adds cases up", () => {
    const counts = {}
    addOutcomes(counts, [{ id: "a", outcome: "accepted" }, { id: "a", outcome: "dismissed" }])
    addOutcomes(counts, [{ id: "a", outcome: "dismissed" }])
    expect(counts).toEqual({ a: { accepted: 1, dismissed: 2 } })
  })
})
