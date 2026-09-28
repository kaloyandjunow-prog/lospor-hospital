import { describe, expect, it } from "vitest"

import { intraopResumeWindow } from "./intraop-commands"

// Resume after End case, one rule for the PWA and the web (9.13.0).

const ended = "2026-09-27T12:00:00.000Z" // 15:00 in Sofia
const at = (minutes: number) => new Date(Date.parse(ended) + minutes * 60_000)

describe("the resume window", () => {
  it("is open for thirty minutes from the saved end, then closed", () => {
    expect(intraopResumeWindow(ended, at(0))).toMatchObject({ secondsLeft: 1800, unlimited: false })
    expect(intraopResumeWindow(ended, at(20)).secondsLeft).toBe(600)
    expect(intraopResumeWindow(ended, at(30))).toEqual({ secondsLeft: 0, unlimited: false, until: null })
    // Long after: closed, with no time left -- never a negative count or a closing time.
    expect(intraopResumeWindow(ended, at(45), { timeZone: "Europe/Sofia" })).toEqual({ secondsLeft: 0, unlimited: false, until: null })
  })

  it("never shows more than the window, even when the device clock is behind the end", () => {
    expect(intraopResumeWindow(ended, at(-10)).secondsLeft).toBe(1800)
  })

  it("says when it closes in the case's zone, whatever zone the machine is in", () => {
    expect(intraopResumeWindow(ended, at(5), { timeZone: "Europe/Sofia" }).until).toBe("15:30")
    expect(intraopResumeWindow(ended, at(5), { timeZone: "Etc/GMT-1" }).until).toBe("13:30")
    expect(intraopResumeWindow(ended, at(5)).until).toBeNull()
  })

  it("is always open on a case ended automatically", () => {
    expect(intraopResumeWindow(ended, at(60 * 24 * 7), { autoEnded: true })).toEqual({ secondsLeft: 0, unlimited: true, until: null })
  })
})
