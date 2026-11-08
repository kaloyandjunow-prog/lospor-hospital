import { describe, expect, it } from "vitest"
import {
  airwayDeviceCounts,
  airwayDeviceEntriesOf,
  airwayDeviceEntryLines,
  airwayDevicesInUse,
  airwayPrimaryConflict,
  exchangedStatus,
  legacyAirwayDeviceEntries,
  legacyFieldsFromEntries,
  parseAirwayDeviceEntries,
  replaceAirwayDevice,
  type AirwayDeviceEntry,
} from "./airway-device-entries"

const words = {
  device: (code: string) => ({ LMA: "LMA", ORAL_ETT: "Oral ETT", NASAL_ETT: "Nasal ETT" } as Record<string, string>)[code] ?? code,
  attribute: (value: string) => value,
  status: (status: "failed" | "replaced") => status,
  time: (iso: string) => iso.slice(11, 16),
}

const tube = (id: string, size: number, insertedAt: string): AirwayDeviceEntry =>
  ({ id, device: "ORAL_ETT", details: { oralTubeSize: size, oralCuffed: true }, insertedAt, status: "in_use" })

describe("the airway device list", () => {
  it("keeps devices without details of their own, such as an oropharyngeal airway", () => {
    expect(legacyAirwayDeviceEntries({ airwayDevices: ["OPA", "LMA"], lmaSize: 4 }).map(entry => entry.device)).toEqual(["OPA", "LMA"])
    const entries = parseAirwayDeviceEntries([{ id: "o", device: "NPA", details: {}, status: "in_use" }])
    expect(legacyFieldsFromEntries(entries)).toMatchObject({ airwayDevices: ["NPA"] })
  })

  it("reads a case saved before 10.2.0 from its old fields, never rewriting them", () => {
    const old = { airwayDevices: ["ORAL_ETT", "LMA"], oralTubeSize: 7.5, oralCuffed: true, lmaSize: 4 }
    expect(legacyAirwayDeviceEntries(old)).toEqual([
      { id: "legacy-ORAL_ETT", device: "ORAL_ETT", details: { oralTubeSize: 7.5, oralCuffed: true }, status: "in_use" },
      { id: "legacy-LMA", device: "LMA", details: { lmaSize: 4 }, status: "in_use" },
    ])
    expect(airwayDeviceEntriesOf(old)).toHaveLength(2)
  })

  it("prefers the stored list when there is one", () => {
    const stored = [tube("a", 8, "2026-11-02T10:00:00.000Z")]
    expect(airwayDeviceEntriesOf({ airwayDevices: ["LMA"], lmaSize: 4, airwayDeviceEntries: stored })).toEqual(stored)
  })

  it("drops unreadable entries and details of another device", () => {
    const parsed = parseAirwayDeviceEntries([
      { id: "a", device: "ORAL_ETT", details: { oralTubeSize: 8, lmaSize: 4 }, status: "in_use" },
      { id: "b", device: "not a code" },
      { device: "LMA" },
      "nonsense",
    ])
    expect(parsed).toEqual([{ id: "a", device: "ORAL_ETT", details: { oralTubeSize: 8 }, insertedAt: null, status: "in_use" }])
  })

  it("keeps both tubes after a reintubation, the first failed and pointing to the second", () => {
    const first = tube("a", 8, "2026-11-02T10:00:00.000Z")
    const entries = replaceAirwayDevice([first], "a", tube("b", 8, "2026-11-02T10:42:00.000Z"), "reintubation")
    expect(entries).toMatchObject([
      { id: "a", status: "failed", endedAt: "2026-11-02T10:42:00.000Z", replacedBy: "b", reason: "reintubation" },
      { id: "b", status: "in_use", reason: "reintubation" },
    ])
    expect(airwayDevicesInUse(entries).map(entry => entry.id)).toEqual(["b"])
    expect(airwayDeviceCounts(entries)).toEqual({ ORAL_ETT: 2 })
    expect(airwayDeviceEntryLines(entries, words)).toEqual(["Oral ETT 8 cuffed · failed 10:42", "Oral ETT 8 cuffed"])
  })

  it("marks the old device replaced after a planned exchange, failed otherwise", () => {
    expect(exchangedStatus("planned")).toBe("replaced")
    expect(exchangedStatus("failed_device")).toBe("failed")
    expect(exchangedStatus("unplanned_extubation")).toBe("failed")
    const lma: AirwayDeviceEntry = { id: "l", device: "LMA", details: { lmaSize: 4 }, status: "in_use" }
    const [old] = replaceAirwayDevice([lma], "l", tube("t", 7.5, "2026-11-02T10:10:00.000Z"), "planned")
    expect(old).toMatchObject({ status: "replaced" })
  })

  it("adds a device without taking one out", () => {
    expect(replaceAirwayDevice([], null, tube("t", 7, "2026-11-02T10:00:00.000Z"), "reintubation")).toHaveLength(1)
  })

  it("requires an explicit exchange for a second primary airway, but permits adjuncts", () => {
    const existing = tube("t", 7, "2026-11-02T10:00:00.000Z")
    expect(airwayPrimaryConflict([existing], "LMA")).toBe(existing)
    expect(airwayPrimaryConflict([existing], "ORAL_ETT")).toBe(existing)
    expect(airwayPrimaryConflict([existing], "OPA")).toBeNull()
  })

  it("keeps the old fields filled for readers that know only them", () => {
    const entries = replaceAirwayDevice([tube("a", 7, "2026-11-02T10:00:00.000Z")], "a", tube("b", 8, "2026-11-02T10:42:00.000Z"), "reintubation")
    expect(legacyFieldsFromEntries(entries)).toMatchObject({ airwayDevices: ["ORAL_ETT"], oralTubeSize: 8, oralCuffed: true, lmaSize: null })
  })
})
