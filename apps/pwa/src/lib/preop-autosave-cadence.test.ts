import { describe, expect, it } from "vitest"
import {
  DISCRETE_TAP_DEBOUNCE_MS,
  TYPING_DEBOUNCE_MS,
  autosaveDelayMs,
  isDiscreteTapChange,
} from "./preop-autosave-cadence"

describe("isDiscreteTapChange", () => {
  it("treats a toggled boolean as a discrete tap", () => {
    expect(isDiscreteTapChange({ smoking: true }, { smoking: false })).toBe(true)
  })

  it("treats edited text as typing, so the longer pause applies", () => {
    expect(isDiscreteTapChange({ notes: "ab" }, { notes: "a" })).toBe(false)
  })

  /**
   * A tap that also changes a non-boolean -- selecting a pill that fills in a
   * dependent value, say -- is not a discrete tap. Waiting is the safe answer:
   * a false negative costs a slower save, never a lost one.
   */
  it("is not discrete when a non-boolean changed alongside a boolean", () => {
    expect(isDiscreteTapChange(
      { smoking: true, notes: "b" },
      { smoking: false, notes: "a" },
    )).toBe(false)
  })

  it("is not a change at all when nothing moved", () => {
    const values = { smoking: false, notes: "a" }
    expect(isDiscreteTapChange({ ...values }, values)).toBe(false)
  })

  // The very first change has no previous snapshot to compare against.
  it("is not discrete on the first render", () => {
    expect(isDiscreteTapChange({ smoking: true }, null)).toBe(false)
  })

  it("counts a boolean arriving where there was none before", () => {
    expect(isDiscreteTapChange({ smoking: true }, {})).toBe(true)
  })

  // null and undefined are tri-state clinical answers, not booleans: moving
  // from "unanswered" to "no" is still a tap.
  it("treats a tri-state null becoming false as a tap", () => {
    expect(isDiscreteTapChange({ allergies: false }, { allergies: null })).toBe(true)
  })
})

describe("autosaveDelayMs", () => {
  it("saves a tap quickly and typing slowly", () => {
    expect(autosaveDelayMs(true)).toBe(DISCRETE_TAP_DEBOUNCE_MS)
    expect(autosaveDelayMs(false)).toBe(TYPING_DEBOUNCE_MS)
  })
})
