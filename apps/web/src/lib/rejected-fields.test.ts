import { describe, expect, it } from "vitest"
import { CLINICAL_RANGES } from "@lospor/core"
import {
  describeRejection,
  fieldKeyOf,
  readRejectedFields,
  rejectedFieldKeys,
  rejectionMessages,
  rejectionsForSection,
} from "./rejected-fields"

/**
 * This module is the only thing that tells a clinician a value was refused
 * rather than saved. Before it existed, a rejected entry vanished silently and
 * the form still looked saved — which is how a whole assessment was lost.
 *
 * Its contract has two halves, and both are asserted here:
 *   1. it is total — junk in never throws, because a notifier that can crash the
 *      form it reports on is worse than no notifier;
 *   2. it states the accepted range, because "Invalid request" tells the
 *      clinician nothing they can act on.
 */
describe("readRejectedFields", () => {
  it("reads a well-formed rejection list", () => {
    expect(readRejectedFields({
      rejectedFields: [{ path: "preop.heightCm", message: "out of range" }],
    })).toEqual([{ path: "preop.heightCm", message: "out of range" }])
  })

  it("never throws on anything a server or network could hand it", () => {
    const junk: unknown[] = [
      undefined, null, 0, "", "not json", [], {},
      { rejectedFields: null },
      { rejectedFields: "nope" },
      { rejectedFields: [null, 42, "x", {}] },
      { rejectedFields: [{ path: 123 }] },
      { rejectedFields: [{ path: "" }] },
      { rejectedFields: [{ message: "no path" }] },
    ]
    for (const body of junk) {
      expect(() => readRejectedFields(body)).not.toThrow()
      expect(Array.isArray(readRejectedFields(body))).toBe(true)
    }
  })

  it("drops entries without a usable path rather than emitting a blank field", () => {
    expect(readRejectedFields({
      rejectedFields: [{ path: "preop.weightKg" }, { path: "" }, { message: "orphan" }],
    })).toEqual([{ path: "preop.weightKg", message: undefined }])
  })

  it("ignores a non-string message instead of rendering it", () => {
    expect(readRejectedFields({ rejectedFields: [{ path: "x", message: { a: 1 } }] }))
      .toEqual([{ path: "x", message: undefined }])
  })
})

describe("fieldKeyOf", () => {
  it("takes the bare field name from a section-prefixed path", () => {
    expect(fieldKeyOf("preop.heightCm")).toBe("heightCm")
    expect(fieldKeyOf("a.b.c.weightKg")).toBe("weightKg")
  })

  it("accepts a bare path, so an older server cannot break the client", () => {
    expect(fieldKeyOf("heightCm")).toBe("heightCm")
  })
})

describe("describeRejection", () => {
  it("states the accepted range so the clinician knows what to do", () => {
    const height = CLINICAL_RANGES.HEIGHT_RANGE
    const message = describeRejection("preop.heightCm")
    expect(message).toContain(String(height.min))
    expect(message).toContain(String(height.max))
    // The bounds must be the same ones the API enforces, or the advice is wrong.
    expect(message).toBe(`Not saved — must be ${height.min}–${height.max}${height.unit ? ` ${height.unit}` : ""}`)
  })

  it("falls back to the server's own message when the field has no known range", () => {
    expect(describeRejection("preop.mysteryField", "must be a number"))
      .toBe("Not saved — must be a number")
  })

  it("always produces something to show, even with nothing to go on", () => {
    expect(describeRejection("preop.mysteryField")).toBe("Not saved — value not accepted")
  })

  it("honours a translated not-saved label", () => {
    expect(describeRejection("preop.mysteryField", undefined, "Незапазено"))
      .toContain("Незапазено")
  })
})

describe("rejectionsForSection", () => {
  const rejected = [
    { path: "preop.heightCm" },
    { path: "intraop.fio2Percent" },
    { path: "heightCm" },
  ]

  it("keeps only its own section, plus unprefixed legacy paths", () => {
    expect(rejectionsForSection(rejected, "preop").map(r => r.path))
      .toEqual(["preop.heightCm", "heightCm"])
    expect(rejectionsForSection(rejected, "intraop").map(r => r.path))
      .toEqual(["intraop.fio2Percent", "heightCm"])
  })
})

describe("rejectedFieldKeys / rejectionMessages", () => {
  it("flags each field once, keyed by bare name", () => {
    const keys = rejectedFieldKeys([{ path: "preop.heightCm" }, { path: "heightCm" }])
    expect([...keys]).toEqual(["heightCm"])
  })

  it("keeps the first message per field so one field shows one message", () => {
    const messages = rejectionMessages([
      { path: "preop.mysteryField", message: "first" },
      { path: "preop.mysteryField", message: "second" },
    ])
    expect(messages.get("mysteryField")).toBe("Not saved — first")
    expect(messages.size).toBe(1)
  })
})
