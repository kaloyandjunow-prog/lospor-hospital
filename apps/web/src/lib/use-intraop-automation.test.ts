// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_INTRAOP_AUTOMATION } from "@lospor/core/intraop-automation"
import { SEED_SUCCESSION } from "@lospor/core/event-succession"
import { fallbackAutomation } from "./use-intraop-automation"

afterEach(() => localStorage.clear())

describe("the suggestion settings when the server cannot be read", () => {
  it("use the defaults, with the starting succession links, when nothing was read before", () => {
    const fallback = fallbackAutomation("user-1")
    expect(fallback.settings).toEqual(DEFAULT_INTRAOP_AUTOMATION)
    expect(fallback.succession).toEqual([...SEED_SUCCESSION])
    expect(fallback).toMatchObject({ stats: null, ready: true, unavailable: true })
  })

  it("use what this browser last read for the same account, never another account's", () => {
    localStorage.setItem("lospor_intraop_automation_last:user-1", JSON.stringify({
      settings: { enabled: true, groups: { treatmentSuggestions: false } },
      succession: [],
    }))
    expect(fallbackAutomation("user-1").settings.groups.treatmentSuggestions).toBe(false)
    expect(fallbackAutomation("user-2").settings.groups.treatmentSuggestions).toBe(true)
  })
})
