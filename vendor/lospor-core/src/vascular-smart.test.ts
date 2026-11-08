import { describe, expect, it } from "vitest"
import {
  addVascularLine, ARTERIAL_SITES, CENTRAL_SITES, newVascularLine, PERIPHERAL_GAUGES, resolveVascularTime, suggestedArterialGauge,
  suggestedPeripheralGauge, vascularAsks, vascularChoices, vascularClinicalEvent, vascularCounts, vascularSiteCrumb, vascularTypeOfSite, VASCULAR_CATALOG_LEAVES, VASCULAR_EVENT_TYPE,
} from "./vascular-smart"

const START = "2026-11-02T09:30:00.000Z"
const NOW = "2026-11-02T09:55:00.000Z"

describe("which kinds of access come first", () => {
  it("leads with all three for general anaesthesia, and with a peripheral line for anything else", () => {
    expect(vascularChoices(["GENERAL_TIVA"]).main).toEqual(["PERIPHERAL", "ARTERIAL", "CENTRAL"])
    expect(vascularChoices([]).main).toEqual(["PERIPHERAL", "ARTERIAL", "CENTRAL"])
    expect(vascularChoices(["REGIONAL_SPINAL"])).toEqual({ main: ["PERIPHERAL"], other: ["ARTERIAL", "CENTRAL"] })
    expect(vascularChoices(["SEDATION_DEEP"]).main).toEqual(["PERIPHERAL"])
  })
})

describe("sizes", () => {
  it("offers peripheral cannulas from 14G to 26G, each with its colour", () => {
    expect(PERIPHERAL_GAUGES.map(gauge => gauge.size)).toEqual(["14", "16", "18", "20", "22", "24", "26"])
    expect(PERIPHERAL_GAUGES.find(gauge => gauge.size === "24")?.color).toBe("#f2d02b")
    expect(PERIPHERAL_GAUGES.every(gauge => /^#[0-9a-f]{6}$/.test(gauge.color))).toBe(true)
  })

  it("suggests 18G for an adult and smaller by age for a child", () => {
    expect(suggestedPeripheralGauge({ ageYears: 45 })).toBe("18")
    expect(suggestedPeripheralGauge({ ageYears: 6 })).toBe("20")
    expect(suggestedPeripheralGauge({ ageYears: 3 })).toBe("22")
    expect(suggestedPeripheralGauge({ ageDays: 200 })).toBe("24")
    expect(suggestedPeripheralGauge({ clinicalMode: "PEDIATRIC" })).toBe("22")
    expect(suggestedPeripheralGauge({})).toBe("18")
    expect(suggestedArterialGauge({ ageYears: 45 })).toBe("20")
    expect(suggestedArterialGauge({ ageYears: 2 })).toBe("24")
  })
})

describe("what each kind asks", () => {
  it("exposes every selectable legacy site to Smart disclosure", () => {
    expect(VASCULAR_CATALOG_LEAVES.map(site => site.code)).toEqual([
      "VEN_PERIPHERAL",
      "ART_RADIAL", "ART_ULNAR", "ART_BRACHIAL", "ART_AXILLARY", "ART_CAROTID", "ART_FEMORAL",
      "CVK_AXILLARY", "CVK_IJV", "CVK_EJV", "CVK_SUBCLAVIAN", "CVK_FEMORAL",
      "PICC_BRACHIAL", "PICC_BASILIC", "PICC_CEPHALIC",
    ])
    expect(VASCULAR_CATALOG_LEAVES.filter(site => site.group === "CENTRAL").every(site => site.centralType)).toBe(true)
  })

  it("asks who placed it and the size for a peripheral line, and no site", () => {
    expect(vascularAsks("PERIPHERAL").map(ask => ask.field)).toEqual(["origin", "size"])
  })

  it("asks the site and size for an arterial line, from the catalogue's sites", () => {
    expect(vascularAsks("ARTERIAL").map(ask => ask.field)).toEqual(["origin", "site", "size"])
    expect(ARTERIAL_SITES.map(site => site.code)).toContain("ART_RADIAL")
  })

  it("asks type, site, lumens, depth and size for a central line, the site following the type", () => {
    expect(vascularAsks("CENTRAL").map(ask => ask.field)).toEqual(["origin", "centralType", "site", "lumens", "depth", "size"])
    const sites = (type: "CVK" | "PICC") => ((vascularAsks("CENTRAL", type).find(ask => ask.field === "site") as unknown) as { values: readonly { code: string }[] }).values.map(site => site.code)
    expect(sites("CVK")).toContain("CVK_IJV")
    expect(sites("PICC")).toContain("PICC_BASILIC")
    expect(CENTRAL_SITES.CVK.length).toBeGreaterThan(2)
  })
})

describe("writing the line to the case", () => {
  it("writes a peripheral line the legacy tab reads: its site, label, size in G, and the time it went in", () => {
    const line = newVascularLine({ id: "v1", type: "PERIPHERAL", size: "22", origin: "here", insertedAt: START })
    expect(line).toMatchObject({ id: "v1", site: "VEN_PERIPHERAL", siteLabel: "Venous › Peripheral IV", size: "22", sizeUnit: "G", insertedAt: START })
    expect(line.preexisting).toBeUndefined()
    expect(vascularTypeOfSite(line.site)).toBe("PERIPHERAL")
  })

  it("marks a line that arrived with the patient, with no time", () => {
    expect(newVascularLine({ id: "v2", type: "PERIPHERAL", size: "20", origin: "ward", insertedAt: null })).toMatchObject({ preexisting: true, insertedAt: null })
    // A time given for it (when the ward placed it) is kept.
    expect(newVascularLine({ id: "v2", type: "PERIPHERAL", size: "20", origin: "ward", insertedAt: START })).toMatchObject({ preexisting: true, insertedAt: START })
  })

  it("writes a central line with its lumens, depth and size in Fr, and an arterial line in G", () => {
    expect(newVascularLine({ id: "v3", type: "CENTRAL", site: "CVK_IJV", size: "7", lumens: "3", depthCm: "14", origin: "here", insertedAt: NOW }))
      .toMatchObject({ siteLabel: "Venous › Central › Central line › Internal jugular", sizeUnit: "Fr", lumens: "3", depthCm: "14" })
    expect(newVascularLine({ id: "v4", type: "ARTERIAL", site: "ART_RADIAL", size: "20", origin: "here", insertedAt: NOW })).toMatchObject({ sizeUnit: "G", siteLabel: "Arterial › Radial" })
  })

  it("keeps both lines when one fails: the first marked failed at the new line's time, the second in place", () => {
    const first = addVascularLine([], { id: "v1", type: "PERIPHERAL", size: "18", origin: "here", insertedAt: START })
    const both = addVascularLine(first, { id: "v2", type: "PERIPHERAL", size: "20", origin: "here", insertedAt: NOW, replacesIndex: 0 })
    expect(both.map(line => [line.id, line.failed ?? false])).toEqual([["v1", true], ["v2", false]])
    expect(both[0]!.failedAt).toBe(NOW)
    expect(vascularCounts(both)).toEqual({ PERIPHERAL: 1, ARTERIAL: 0, CENTRAL: 0 })
  })

  it("names a site the way the catalogue does, and falls back to the code", () => {
    expect(vascularSiteCrumb("PICC_BASILIC")).toBe("Venous › Central › PICC › Basilic")
    expect(vascularSiteCrumb("SOMETHING")).toBe("SOMETHING")
  })
})

describe("when it went in", () => {
  const context = { startedAt: START, now: NOW }
  it("takes the start of anaesthesia, now, a time picked, the timeline, or nothing for a line that arrived", () => {
    expect(resolveVascularTime("start", context)).toBe(START)
    expect(resolveVascularTime("start", { startedAt: null, now: NOW })).toBeNull()
    expect(resolveVascularTime("now", context)).toBe(NOW)
    expect(resolveVascularTime("pick", { ...context, picked: "2026-11-02T09:40:00Z" })).toBe("2026-11-02T09:40:00.000Z")
    expect(resolveVascularTime("timeline", { ...context, picked: "2026-11-02T09:35:00.000Z" })).toBe("2026-11-02T09:35:00.000Z")
    expect(resolveVascularTime("arrived", context)).toBeNull()
  })
})

describe("the events that open the panel", () => {
  it("maps each access event to its kind", () => {
    expect(VASCULAR_EVENT_TYPE["IV line in"]).toEqual({ type: "PERIPHERAL" })
    expect(VASCULAR_EVENT_TYPE["Art line in"]).toEqual({ type: "ARTERIAL" })
    expect(VASCULAR_EVENT_TYPE["CVC in"]).toEqual({ type: "CENTRAL", centralType: "CVK" })
    expect(VASCULAR_EVENT_TYPE["PICC"]).toEqual({ type: "CENTRAL", centralType: "PICC" })
  })

  it("maps a confirmed line to the event shown in the timeline", () => {
    expect(vascularClinicalEvent("PERIPHERAL", "VEN_PERIPHERAL")).toBe("IV line in")
    expect(vascularClinicalEvent("ARTERIAL", "ART_RADIAL")).toBe("Art line in")
    expect(vascularClinicalEvent("CENTRAL", "CVK_IJV")).toBe("CVC in")
    expect(vascularClinicalEvent("CENTRAL", "PICC_BASILIC")).toBe("PICC")
  })
})
