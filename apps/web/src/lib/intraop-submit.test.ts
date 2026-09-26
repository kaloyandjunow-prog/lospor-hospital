import { describe, expect, it } from "vitest"
import { intraopAutosaveValues, intraopEndCaseValues } from "./intraop-submit"

describe("intraopAutosaveValues", () => {
  // 9.12.1: the form's empty vitals list differed from every loaded case (the
  // server does not return it), so each autosave refreshed the case and the
  // refresh autosaved again -- several saves a second while a chart was open.
  it("leaves out the fields read off the chart", () => {
    const values = { startTime: "08:00", positions: ["SUPINE"], vitals: [], drugsAdministered: [], urineMl: 200 }
    expect(intraopAutosaveValues(values)).toEqual({ startTime: "08:00", positions: ["SUPINE"], urineMl: 200 })
  })

  it("does not change the values it was given", () => {
    const values = { vitals: [{ hr: 70 }], drugsAdministered: [], airwayNotes: "easy" }
    intraopAutosaveValues(values)
    expect(values).toEqual({ vitals: [{ hr: 70 }], drugsAdministered: [], airwayNotes: "easy" })
  })
})

describe("intraopEndCaseValues", () => {
  it("ends in the case's zone", () => {
    // A 00:00 start never makes the end the next day, whatever the machine's zone.
    expect(intraopEndCaseValues(new Date("2026-09-26T12:14:34.000Z"), "Europe/Sofia", "00:00")).toEqual({
      endTime: "15:14",
      endedAt: "2026-09-26T12:14:34.000Z",
      timezone: "Europe/Sofia",
      endTimeNextDay: false,
    })
  })

  it("marks an end after midnight as the next day", () => {
    // Local clock: 00:30 the morning after a 23:10 start.
    expect(intraopEndCaseValues(new Date(2026, 8, 27, 0, 30), "UTC", "23:10").endTimeNextDay).toBe(true)
    expect(intraopEndCaseValues(new Date(2026, 8, 26, 23, 50), "UTC", "23:10").endTimeNextDay).toBe(false)
  })
})
