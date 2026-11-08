import { describe, expect, it } from "vitest"
import { DRUG_CATALOG } from "../catalog/intraop-drugs"
import { FLUID_CATALOG } from "../catalog/intraop-fluids"
import { INFUSION_CATALOG } from "../catalog/intraop-infusions"
import { CLINICAL_EVENT_CATS } from "../catalog/intraop-events"
import { ALL_COMPLICATIONS } from "../complications"
import { ADMINISTRATION_ROUTE_CODES, normalizeAdministrationRoute } from "../clinical-rule-vocabulary"
import { LAB_LIBRARY } from "../labs"
import { LAB_TEST_NAMES } from "./labs"
import { AUTOMATION_GROUPS } from "../intraop-automation"
import { AUTOMATIONS, AUTOMATION_IDS, cardAutomationId } from "./automations"
import { SUGGESTION_CARDS, suggestionCardFor } from "./catalogue"
import type { RowDef } from "./cards"

/**
 * Is everything the suggestion cards point at real? A card row names a drug, a fluid, an infusion, an event, a
 * complication, a lab test or a route; a name that does not exist in its catalogue fails silently on the screen
 * (an empty sheet, a row that can never show as done). This holds each link to its catalogue.
 */

const drugs = new Set(DRUG_CATALOG.map(entry => entry.name))
const infusions = new Set(INFUSION_CATALOG.map(entry => entry.name))
const fluids = new Set(FLUID_CATALOG.map(entry => entry.name))
const fluidCategories = new Set(FLUID_CATALOG.map(entry => entry.category))
const events = new Set(CLINICAL_EVENT_CATS.flatMap(category => category.events.map(event => event.label)))
const complications = new Set(ALL_COMPLICATIONS)
const labs = new Set(LAB_LIBRARY.map(test => test.name))

const rows = SUGGESTION_CARDS.flatMap(card => card.rows.map(row => ({ card, row })))
const where = (card: typeof SUGGESTION_CARDS[number], row: RowDef) => `${card.complications[0]} / ${row.id}`

describe("the suggestion cards point at things that exist", () => {
  it("names only complications the app offers, each reaching its own card", () => {
    for (const card of SUGGESTION_CARDS) {
      for (const label of card.complications) {
        expect(complications.has(label), `card complication ${label}`).toBe(true)
        expect(suggestionCardFor(label), label).toBe(card)
      }
    }
  })

  it("gives every card a registered, switchable automation line", () => {
    for (const card of SUGGESTION_CARDS) expect(AUTOMATION_IDS.has(cardAutomationId(card.complications[0]!)), card.complications[0]).toBe(true)
  })

  it("uses drugs, infusions and fluids that are in their catalogues", () => {
    for (const { card, row } of rows) {
      if (row.kind === "drug") expect(drugs.has(row.drug), `${where(card, row)} drug ${row.drug}`).toBe(true)
      if (row.kind === "infusion") expect(infusions.has(row.drug), `${where(card, row)} infusion ${row.drug}`).toBe(true)
      if (row.kind === "fluid") {
        if (row.fluid) expect(fluids.has(row.fluid), `${where(card, row)} fluid ${row.fluid}`).toBe(true)
        if (row.category) expect(fluidCategories.has(row.category), `${where(card, row)} fluid category ${row.category}`).toBe(true)
        expect(Boolean(row.fluid) !== Boolean(row.category), `${where(card, row)} names a fluid or a category, not both`).toBe(true)
      }
    }
  })

  it("uses routes the app knows", () => {
    for (const { card, row } of rows) {
      if (row.kind === "drug" && row.route) {
        expect(ADMINISTRATION_ROUTE_CODES as readonly string[], where(card, row)).toContain(normalizeAdministrationRoute(row.route))
      }
    }
  })

  it("uses events, complications and lab tests that exist", () => {
    const missing: string[] = []
    const need = (ok: boolean, text: string) => { if (!ok) missing.push(text) }
    for (const { card, row } of rows) {
      if (row.kind === "event") need(events.has(row.label), `${where(card, row)} event ${row.label}`)
      if (row.kind === "relabel") for (const choice of row.choices) need(complications.has(choice), `${where(card, row)} relabel ${choice}`)
      if (row.kind === "alsoLog") for (const label of row.complications) need(complications.has(label), `${where(card, row)} alsoLog ${label}`)
      if (row.kind === "openCard") {
        need(complications.has(row.complication), `${where(card, row)} openCard ${row.complication}`)
        need(suggestionCardFor(row.complication) !== undefined, `${where(card, row)} opens a card for ${row.complication}`)
      }
      if (row.kind === "question" && row.logs) need(complications.has(row.logs), `${where(card, row)} logs ${row.logs}`)
      if (row.kind === "lab") for (const test of row.tests) need(labs.has(test), `${where(card, row)} lab ${test}`)
    }
    expect(missing).toEqual([])
  })

  it("reveals only rows the same card has, and branches only to options it offers", () => {
    for (const card of SUGGESTION_CARDS) {
      const ids = new Set(card.rows.map(row => row.id))
      const options = new Set(card.branches?.options.map(option => option.id) ?? [])
      for (const row of card.rows) {
        if (row.kind === "question") for (const reveal of row.reveals) expect(ids.has(reveal), `${where(card, row)} reveals ${reveal}`).toBe(true)
        for (const branch of row.branches ?? []) expect(options.has(branch), `${where(card, row)} branch ${branch}`).toBe(true)
      }
    }
  })

  it("has unique row ids within a card, and a real title in both languages", () => {
    for (const card of SUGGESTION_CARDS) {
      const seen = new Set<string>()
      for (const row of card.rows) {
        // The same id may appear for different branches (amiodarone shockable / non-shockable): they never show together.
        const key = `${row.id}|${(row.branches ?? []).join(",")}`
        expect(seen.has(key), `${card.complications[0]} repeats ${key}`).toBe(false)
        seen.add(key)
        expect(row.title.en.trim().length, `${where(card, row)} en`).toBeGreaterThan(0)
        expect(row.title.bg.trim().length, `${where(card, row)} bg`).toBeGreaterThan(0)
        expect(/[А-Яа-я]/.test(row.title.en), `${where(card, row)} Cyrillic in the English title`).toBe(false)
        // A Latin acronym alone (ROSC) is a fine Bulgarian title.
        expect(/[А-Яа-я]/.test(row.title.bg) || /^[A-Z0-9 ·/()%.,+-]+$/.test(row.title.bg), `${where(card, row)} Bulgarian title`).toBe(true)
      }
    }
  })
})

describe("the lab questions look for tests the library has", () => {
  it("names each test exactly as the library does", () => {
    expect(Object.values(LAB_TEST_NAMES).filter(name => !labs.has(name))).toEqual([])
  })
})

describe("every automation line is real", () => {
  it("sits in a known group and has both languages", () => {
    const problems: string[] = []
    for (const item of AUTOMATIONS) {
      if (item.group !== "vitalQuestions" && !(AUTOMATION_GROUPS as readonly string[]).includes(item.group)) problems.push(`${item.id}: unknown group ${item.group}`)
      if (!(item.en.trim() && item.bg.trim() && item.detailEn.trim() && item.detailBg.trim())) problems.push(`${item.id}: a text is empty`)
      if (/[А-Яа-я]/.test(item.en + item.detailEn)) problems.push(`${item.id}: Cyrillic in the English text`)
      if (!/[А-Яа-я]/.test(item.bg + item.detailBg)) problems.push(`${item.id}: no Bulgarian in the Bulgarian text`)
    }
    expect(problems).toEqual([])
  })
})
