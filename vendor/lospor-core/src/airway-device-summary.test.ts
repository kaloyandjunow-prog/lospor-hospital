import { describe, expect, it } from "vitest"
import { airwayDeviceSummary, type AirwayDeviceWords } from "./intraop-domain"

/**
 * Stand-ins for each app's display layer, so the tests read the composition and
 * not the vocabulary. What matters here is which parts appear, in what order,
 * and when there is enough to describe at all.
 */
const words: AirwayDeviceWords = {
  device: code => ({
    LMA: "LMA",
    ORAL_ETT: "Oral ETT",
    NASAL_ETT: "Nasal ETT",
    DOUBLE_LUMEN_TUBE: "Double lumen",
    ENDOBRONCHIAL_TUBE: "Endobronchial",
  }[code] ?? code),
  attribute: code => ({
    cuffed: "cuffed",
    uncuffed: "uncuffed",
    left: "left",
    right: "right",
  }[code] ?? code),
}

describe("describing a confirmed airway device", () => {
  it("names an LMA with its size", () => {
    expect(airwayDeviceSummary("LMA", { lmaSize: 4 }, words)).toBe("LMA 4")
  })

  it("says whether a tube is cuffed, which is the part that matters", () => {
    expect(airwayDeviceSummary("ORAL_ETT", { oralTubeSize: 7.5, oralCuffed: true }, words))
      .toBe("Oral ETT 7.5 cuffed")
    expect(airwayDeviceSummary("NASAL_ETT", { nasalTubeSize: "6", nasalCuffed: false }, words))
      .toBe("Nasal ETT 6 uncuffed")
  })

  /**
   * The two clients stored these differently -- one as numbers off a picker,
   * the other as strings out of a text field -- and each checked for presence
   * its own way. A size of "7.5" and a size of 7.5 are the same tube.
   */
  it("reads a size the same whether it arrived as a number or as text", () => {
    expect(airwayDeviceSummary("LMA", { lmaSize: "4" }, words))
      .toBe(airwayDeviceSummary("LMA", { lmaSize: 4 }, words))
  })

  it("has nothing to say until the size is chosen", () => {
    expect(airwayDeviceSummary("LMA", {}, words)).toBeNull()
    expect(airwayDeviceSummary("LMA", { lmaSize: null }, words)).toBeNull()
    expect(airwayDeviceSummary("LMA", { lmaSize: "   " }, words)).toBeNull()
  })

  /**
   * Cuffed and uncuffed are both answers; not yet asked is not. A tube shown as
   * uncuffed because nobody has said either way is a false statement about the
   * airway.
   */
  it("waits for the cuff to be answered rather than assuming uncuffed", () => {
    expect(airwayDeviceSummary("ORAL_ETT", { oralTubeSize: 7.5 }, words)).toBeNull()
    expect(airwayDeviceSummary("ORAL_ETT", { oralTubeSize: 7.5, oralCuffed: null }, words)).toBeNull()
    expect(airwayDeviceSummary("ORAL_ETT", { oralTubeSize: 7.5, oralCuffed: false }, words))
      .toBe("Oral ETT 7.5 uncuffed")
  })

  it("describes a double lumen tube in full", () => {
    expect(airwayDeviceSummary(
      "DOUBLE_LUMEN_TUBE",
      { dltType: "Carlens", dltSide: "Left", dltSize: 37 },
      words,
    )).toBe("Double lumen Carlens left 37Fr")
  })

  // The side arrives capitalised from the picker and is a vocabulary code here.
  it("resolves the side through the shared vocabulary whatever its casing", () => {
    expect(airwayDeviceSummary("DOUBLE_LUMEN_TUBE", { dltSide: "RIGHT" }, words))
      .toBe("Double lumen right")
  })

  /**
   * Unlike the other devices, this one describes what it has. The three parts
   * are picked one at a time and a summary that stayed blank until all three
   * were in would say nothing during the entry it exists to confirm.
   */
  it.each([
    [{ dltType: "Robertshaw" }, "Double lumen Robertshaw"],
    [{ dltSide: "Left" }, "Double lumen left"],
    [{ dltSize: 39 }, "Double lumen 39Fr"],
    [{ dltType: "Carlens", dltSize: 35 }, "Double lumen Carlens 35Fr"],
  ])("describes a part-entered double lumen tube as %o", (input, expected) => {
    expect(airwayDeviceSummary("DOUBLE_LUMEN_TUBE", input, words)).toBe(expected)
  })

  it("has nothing to say about an untouched double lumen tube", () => {
    expect(airwayDeviceSummary("DOUBLE_LUMEN_TUBE", {}, words)).toBeNull()
  })

  it("carries the millimetre unit on an endobronchial tube", () => {
    expect(airwayDeviceSummary("ENDOBRONCHIAL_TUBE", { endobronchialSize: 8 }, words))
      .toBe("Endobronchial 8mm")
  })

  // A face mask has no sub-options, so the caller shows its plain name.
  it("returns nothing for a device that has no parts to describe", () => {
    expect(airwayDeviceSummary("FACE_MASK", { lmaSize: 4 }, words)).toBeNull()
  })
})
