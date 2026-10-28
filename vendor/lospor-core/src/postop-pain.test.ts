import { describe, expect, it } from "vitest"
import {
  FLACC_ITEMS,
  NIPS_ITEMS,
  PAED_ITEMS,
  flaccBand,
  flaccTotal,
  isFpsrScore,
  nipsBand,
  nipsTotal,
  paedOffered,
  paedTotal,
  painScalesFor,
  selfReportBand,
} from "./postop-pain"
import { suggestAldreteCirculation, suggestAldreteSpO2 } from "./postop"
import { canonicalizePostopPatch } from "./case-payloads"
import { validatePostopPatch } from "./clinical-validation"

describe("which pain scales a patient is offered", () => {
  it("gives adults NRS", () => {
    expect(painScalesFor({ clinicalMode: "ADULT", ageYears: 40 })).toEqual(["NRS"])
  })

  it("gives a newborn NIPS, a younger child FLACC and FPS-R, and NRS from 8 years", () => {
    expect(painScalesFor({ clinicalMode: "PEDIATRIC", ageValue: 10, ageUnit: "DAYS" })).toEqual(["NIPS"])
    expect(painScalesFor({ clinicalMode: "PEDIATRIC", ageValue: 27, ageUnit: "DAYS" })).toEqual(["NIPS"])
    expect(painScalesFor({ clinicalMode: "PEDIATRIC", ageValue: 28, ageUnit: "DAYS" })).toEqual(["FLACC", "FPS_R"])
    expect(painScalesFor({ clinicalMode: "PEDIATRIC", ageValue: 3, ageUnit: "MONTHS" })).toEqual(["FLACC", "FPS_R"])
    expect(painScalesFor({ clinicalMode: "PEDIATRIC", ageValue: 7, ageUnit: "YEARS" })).toEqual(["FLACC", "FPS_R"])
    expect(painScalesFor({ clinicalMode: "PEDIATRIC", ageValue: 8, ageUnit: "YEARS" })).toEqual(["NRS"])
    expect(painScalesFor({ clinicalMode: "PEDIATRIC", ageYears: 15 })).toEqual(["NRS"])
  })

  it("treats a child entered as 0 completed years as an infant, not a newborn", () => {
    expect(painScalesFor({ clinicalMode: "PEDIATRIC", ageYears: 0 })).toEqual(["FLACC", "FPS_R"])
  })

  it("offers every scale to a child whose age is not known yet", () => {
    expect(painScalesFor({ clinicalMode: "PEDIATRIC" })).toEqual(["NIPS", "FLACC", "FPS_R", "NRS"])
  })

  it("offers PAED to every child and no adult", () => {
    expect(paedOffered("PEDIATRIC")).toBe(true)
    expect(paedOffered("ADULT")).toBe(false)
  })
})

describe("item-scored totals", () => {
  it("adds FLACC only once all five behaviours are scored", () => {
    expect(flaccTotal({ flaccFace: 1, flaccLegs: 2, flaccActivity: 0, flaccCry: 1 })).toBeNull()
    expect(flaccTotal({ flaccFace: 1, flaccLegs: 2, flaccActivity: 0, flaccCry: 1, flaccConsolability: 2 })).toBe(6)
  })

  it("refuses a value an item cannot score", () => {
    expect(nipsTotal({ nipsFacialExpression: 2, nipsCry: 0, nipsBreathing: 0, nipsArms: 0, nipsLegs: 0, nipsArousal: 0 })).toBeNull()
    expect(nipsTotal({ nipsFacialExpression: 1, nipsCry: 2, nipsBreathing: 1, nipsArms: 1, nipsLegs: 1, nipsArousal: 1 })).toBe(7)
  })

  it("scores PAED's first three items in reverse", () => {
    // "Not at all" making eye contact, purposeful or aware is the worst answer.
    for (const key of ["paedEyeContact", "paedPurposeful", "paedAware"]) {
      expect(PAED_ITEMS.find(item => item.key === key)!.choices[0].points).toBe(4)
    }
    for (const key of ["paedRestless", "paedInconsolable"]) {
      expect(PAED_ITEMS.find(item => item.key === key)!.choices[0].points).toBe(0)
    }
    expect(paedTotal({ paedEyeContact: 4, paedPurposeful: 4, paedAware: 4, paedRestless: 4, paedInconsolable: 4 })).toBe(20)
  })

  it("has every label in both languages", () => {
    for (const item of [...FLACC_ITEMS, ...NIPS_ITEMS, ...PAED_ITEMS]) {
      expect(item.labelEn && item.labelBg).toBeTruthy()
      for (const choice of item.choices) expect(choice.labelEn && choice.labelBg).toBeTruthy()
    }
  })

  it("reads the bands", () => {
    expect(flaccBand(0)).toBe("none")
    expect(flaccBand(3)).toBe("mild")
    expect(flaccBand(6)).toBe("moderate")
    expect(flaccBand(7)).toBe("severe")
    expect(nipsBand(0)).toBe("none")
    expect(nipsBand(4)).toBe("moderate")
    expect(nipsBand(5)).toBe("severe")
    expect(selfReportBand(8)).toBe("severe")
  })

  it("allows FPS-R only its six faces", () => {
    expect([0, 2, 4, 6, 8, 10].every(isFpsrScore)).toBe(true)
    expect(isFpsrScore(5)).toBe(false)
    expect(validatePostopPatch({ fpsrScore: 5 }).valid).toBe(false)
    expect(validatePostopPatch({ fpsrScore: 6 }).valid).toBe(true)
  })
})

describe("the postop payload keeps totals with their items", () => {
  it("writes the FLACC total once complete and clears it when not", () => {
    const complete = canonicalizePostopPatch({ flaccFace: 1, flaccLegs: 1, flaccActivity: 1, flaccCry: 1, flaccConsolability: 1 })
    expect(complete.flaccTotal).toBe(5)
    const partial = canonicalizePostopPatch({ flaccFace: 1 })
    expect(partial.flaccTotal).toBeNull()
  })

  it("writes PAED's items into paedScore", () => {
    const patch = canonicalizePostopPatch({ paedEyeContact: 3, paedPurposeful: 3, paedAware: 2, paedRestless: 1, paedInconsolable: 0 })
    expect(patch.paedScore).toBe(9)
  })

  it("leaves a total alone when none of its items were sent", () => {
    expect(canonicalizePostopPatch({ paedScore: 11 }).paedScore).toBe(11)
    expect("flaccTotal" in canonicalizePostopPatch({ painScoreNRS: 3 })).toBe(false)
  })
})

describe("Aldrete suggestions from the recovery observations", () => {
  it("suggests SpO2 0 below 90%, 1 at 90-92%, nothing above", () => {
    expect(suggestAldreteSpO2(85)).toBe(0)
    expect(suggestAldreteSpO2(91)).toBe(1)
    expect(suggestAldreteSpO2(97)).toBeNull()
    expect(suggestAldreteSpO2(null)).toBeNull()
  })

  it("suggests circulation from the recovery against the preoperative systolic", () => {
    expect(suggestAldreteCirculation(130, 120)).toBe(2)
    expect(suggestAldreteCirculation(96, 120)).toBe(2) // exactly 20%
    expect(suggestAldreteCirculation(90, 120)).toBe(1)
    expect(suggestAldreteCirculation(60, 120)).toBe(0) // 50%
    expect(suggestAldreteCirculation(120, null)).toBeNull()
  })
})

describe("reading pain back for the summary", () => {
  it("lists each scale scored, with its band, and nothing when none was", async () => {
    const { painSummaryEntries } = await import("./postop-pain")
    expect(painSummaryEntries({}, "en")).toEqual([])
    expect(painSummaryEntries({ flaccTotal: 5, fpsrScore: 4, paedScore: 13 }, "en").map(entry => `${entry.label} ${entry.value}`)).toEqual([
      "FLACC 5 / 10 · moderate pain",
      "FPS-R 4 / 10 · moderate pain",
      "PAED 13 / 20 · emergence delirium likely",
    ])
  })

  it("still shows an older record's single-scale entry", async () => {
    const { painSummaryEntries } = await import("./postop-pain")
    expect(painSummaryEntries({ pediatricPainScale: "FPS_R", pediatricPainScore: 6 }, "bg")).toEqual([{ key: "FPS_R", label: "FPS-R", value: "6 / 10" }])
  })
})
