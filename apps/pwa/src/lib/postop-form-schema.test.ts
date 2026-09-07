import { describe, expect, it } from "vitest"
import { normaliseHandoverCodes, postopFormSchema } from "./postop-form-schema"

describe("postop form schema", () => {
  it("normalises legacy handover codes", () => {
    expect(normaliseHandoverCodes(["obs_q15", "pain_pca", "custom"])).toEqual(["obs_freq", "pca", "custom"])
  })

  it("defaults score and handover fields", () => {
    const parsed = postopFormSchema.parse({})
    // Nothing clinical is defaulted to a value. These were 0 and false, and
    // autosave on any other field persisted them — documenting an Aldrete of 0
    // (unresponsive, apnoeic, circulatory collapse) and PONV ruled out, on a
    // patient nobody had assessed. Only the handover list, which is genuinely
    // empty, defaults.
    expect(parsed.aldreteActivity).toBeUndefined()
    // PONV defaults to null rather than undefined, which is how a clinician
    // takes an answer back: undefined is dropped from a patch, so a PONV ticked
    // by mistake could be recorded and never cleared. Web says null too.
    expect(parsed.ponv).toBeNull()
    expect(parsed.handoverItems).toEqual([])
  })
})
