import { describe, expect, it } from "vitest"
import { CLINICAL_EVENT_CATS } from "./catalog/intraop-events"
import { canonicalComplicationLabel, complicationGroupsBeyond } from "./complications"
import { EVENT_SYNONYM_LABELS, eventSearchScore, eventTerms, foldSearchText } from "./event-synonyms"

const quick = CLINICAL_EVENT_CATS.find(category => category.isComplication)!.events.map(event => event.label)
const everyLabel = [
  ...CLINICAL_EVENT_CATS.flatMap(category => category.events.map(event => event.label)),
  ...complicationGroupsBeyond(quick).flatMap(group => group.items),
]

/** The best-matching events for a search, over every event the selector offers. */
const find = (query: string, limit = 3) => everyLabel
  .map(label => ({ label, score: eventSearchScore(query, label) }))
  .filter((hit): hit is { label: string; score: number } => hit.score != null)
  .sort((a, b) => a.score - b.score)
  .slice(0, limit)
  .map(hit => hit.label)

describe("words for every event, in English and Bulgarian (10.2.0)", () => {
  it("has words for every event and complication the selector offers", () => {
    const missing = everyLabel.filter(label => eventTerms(label).en.length === 0 || eventTerms(label).bg.length === 0)
    expect(missing).toEqual([])
    expect(everyLabel).toHaveLength(113)
  })

  it("has no entry for an event that does not exist", () => {
    const known = new Set([...everyLabel, ...everyLabel.map(canonicalComplicationLabel)])
    expect(EVENT_SYNONYM_LABELS.filter(label => !known.has(label))).toEqual([])
  })

  it("gives each event enough words, none repeated, in both languages", () => {
    for (const label of EVENT_SYNONYM_LABELS) {
      const { en, bg } = eventTerms(label)
      expect(en.length, `${label} English`).toBeGreaterThanOrEqual(5)
      expect(bg.length, `${label} Bulgarian`).toBeGreaterThanOrEqual(5)
      expect(new Set(en.map(foldSearchText)).size, `${label} repeats an English word`).toBe(en.length)
      expect(new Set(bg.map(foldSearchText)).size, `${label} repeats a Bulgarian word`).toBe(bg.length)
    }
  })

  it("writes the Bulgarian words in Bulgarian, with no Latin-only word unless it is an abbreviation or a drug", () => {
    const stray = EVENT_SYNONYM_LABELS.flatMap(label => eventTerms(label).bg.filter(term => /^[a-z0-9 .-]+$/i.test(term) && term.length > 4).map(term => `${label}: ${term}`))
    expect(stray).toEqual([])
  })

  it("finds an event by how colleagues say it", () => {
    expect(find("low bp")[0]).toBe("Hypotension")
    expect(find("desat")[0]).toBe("Hypoxia / desaturation")
    expect(find("heavy bleeding")[0]).toBe("Massive haemorrhage")
    expect(find("a line")[0]).toBe("Art line in")
    expect(find("cannula")).toContain("IV line in")
    expect(find("af")[0]).toBe("Atrial fibrillation")
    expect(find("mh")).toContain("Malignant hyperthermia")
    expect(find("tof")).toContain("Residual neuromuscular blockade")
    expect(find("dantrolene")).toContain("Malignant hyperthermia")
    expect(find("tap")).toContain("Block done")
  })

  it("finds an event in Bulgarian", () => {
    expect(find("ниско налягане")[0]).toBe("Hypotension")
    expect(find("десатурация")[0]).toBe("Hypoxia / desaturation")
    expect(find("кървене")[0]).toBe("Massive haemorrhage")
    expect(find("спинална")[0]).toBe("Spinal in")
    expect(find("екстубация")[0]).toBe("Extubated")
    expect(find("турникет")).toEqual(expect.arrayContaining(["Tourniquet on", "Tourniquet off"]))
    expect(find("анафилаксия")[0]).toBe("Anaphylaxis / allergic reaction")
  })

  it("matches several words in any order and ignores case, accents and punctuation", () => {
    expect(eventSearchScore("PRESSURE low", "Hypotension")).not.toBeNull()
    expect(eventSearchScore("hypoxaemia.", "Hypoxia / desaturation")).not.toBeNull()
    expect(eventSearchScore("  ", "Hypotension")).toBeNull()
    expect(eventSearchScore("zzzzzz", "Hypotension")).toBeNull()
  })

  it("reads a complication under the name the complications list gives it", () => {
    expect(eventTerms(canonicalComplicationLabel("Drug error")).en).toContain("wrong drug")
    expect(find("wrong drug").length).toBeGreaterThan(0)
  })

  it("ranks a name that starts with the typed text before one that only contains it", () => {
    const hits = find("hypo", 8)
    expect(hits.length).toBeGreaterThan(3)
    expect(hits).toEqual(expect.arrayContaining(["Hypotension", "Hypothermia"]))
  })
})
