import { describe, expect, it } from "vitest"
import { SEED_SUCCESSION, type SuccessionLink } from "../event-succession"
import { successionOverview } from "./succession-overview"

const learned = (context: string, from: string, to: string, count: number, total: number, gapMinutes = 4): SuccessionLink => ({ context, from, to, count, total, gapMinutes })

describe("successionOverview (Status)", () => {
  it("shows only the starting values before any case, with no learning yet", () => {
    const rows = successionOverview([])
    expect(rows).toHaveLength(SEED_SUCCESSION.length)
    expect(rows.every(row => row.source === "starting" && row.learnedCases === 0 && row.minCases === 30)).toBe(true)
    expect(rows[0]).toMatchObject({ family: "general", child: false })
    const intubated = rows.find(row => row.context === "general" && row.from === "Induction" && row.to === "Intubated")
    expect(intubated).toMatchObject({ id: "succession:Induction>Intubated", count: 11, total: 20, share: 0.55, fromBg: "Увод", toBg: "Интубация" })
  })

  it("counts progress below the threshold but keeps the starting values", () => {
    const rows = successionOverview([learned("general", "Induction", "Intubated", 10, 12)])
    const induction = rows.filter(row => row.context === "general" && row.from === "Induction")
    expect(induction.every(row => row.source === "starting" && row.learnedCases === 12)).toBe(true)
  })

  it("replaces a starting event with what was learned once it has enough cases, including a link that was never a starting one", () => {
    const rows = successionOverview([
      learned("general", "Induction", "Intubated", 25, 40, 2),
      learned("general", "Induction", "OPA in", 10, 40, 1),
    ])
    const induction = rows.filter(row => row.context === "general" && row.from === "Induction")
    expect(induction.map(row => [row.to, row.source, row.share])).toEqual([["Intubated", "learned", 0.63], ["OPA in", "learned", 0.25]])
    expect(rows.some(row => row.context === "general" && row.from === "Mask vent" && row.source === "starting")).toBe(true)
  })
})
