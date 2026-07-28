import { describe, it, expect } from "vitest"
import {
  readRejectedFields, fieldKeyOf, rejectedFieldKeys,
  rejectionsForSection, describeRejection, rejectionMessages,
} from "@/lib/rejected-fields"

// This code runs on the failure path of a clinical form, so the thing it must
// never do is throw. Every function is total: junk in, empty out.

describe("readRejectedFields — survives anything the server sends", () => {
  it("reads a well-formed list", () => {
    const got = readRejectedFields({ rejectedFields: [{ path: "preop.heightCm", message: "too small" }] })
    expect(got).toEqual([{ path: "preop.heightCm", message: "too small" }])
  })

  it("returns nothing when the key is absent — the ordinary success case", () => {
    expect(readRejectedFields({ id: "abc" })).toEqual([])
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "nope"],
    ["a number", 42],
    ["wrong type for rejectedFields", { rejectedFields: "heightCm" }],
    ["an object instead of an array", { rejectedFields: { path: "x" } }],
  ])("returns [] for %s rather than throwing", (_label, input) => {
    expect(() => readRejectedFields(input)).not.toThrow()
    expect(readRejectedFields(input)).toEqual([])
  })

  it("skips malformed entries but keeps the good ones", () => {
    const got = readRejectedFields({
      rejectedFields: [null, { path: "" }, { nope: 1 }, "x", { path: "preop.weightKg" }],
    })
    expect(got).toEqual([{ path: "preop.weightKg", message: undefined }])
  })

  it("ignores a non-string message rather than rendering it", () => {
    const got = readRejectedFields({ rejectedFields: [{ path: "preop.heightCm", message: { a: 1 } }] })
    expect(got[0].message).toBeUndefined()
  })
})

describe("fieldKeyOf", () => {
  it("takes the last segment of a sectioned path", () => {
    expect(fieldKeyOf("preop.heightCm")).toBe("heightCm")
  })

  it("passes a bare path through — older servers do not prefix", () => {
    expect(fieldKeyOf("heightCm")).toBe("heightCm")
  })

  it("does not return empty for a trailing dot", () => {
    expect(fieldKeyOf("preop.")).toBe("preop.")
  })
})

describe("rejectionsForSection", () => {
  const all = [
    { path: "preop.heightCm" },
    { path: "postop.painScoreNRS" },
    { path: "intraop.startTime" },
    { path: "heightCm" },
  ]

  it("keeps only the section asked for", () => {
    expect(rejectionsForSection(all, "preop").map(r => r.path))
      .toEqual(["preop.heightCm", "heightCm"]) // unprefixed is assumed to be this section
  })

  it("does not leak another section's rejections into the form", () => {
    expect(rejectionsForSection(all, "postop").map(r => r.path))
      .toEqual(["postop.painScoreNRS", "heightCm"])
  })
})

describe("describeRejection — says what to do, not that something is invalid", () => {
  it("states the accepted range for the reported height case", () => {
    // The whole point: "Invalid request" told the clinician nothing.
    expect(describeRejection("preop.heightCm")).toBe("Not saved — must be 30–250 cm")
  })

  it("states the range for a vital sign", () => {
    expect(describeRejection("preop.bpSystolic")).toBe("Not saved — must be 40–300 mmHg")
  })

  it("handles a range with no unit", () => {
    expect(describeRejection("postop.painScoreNRS")).toBe("Not saved — must be 0–10")
  })

  it("falls back to the server's message for a field with no known range", () => {
    expect(describeRejection("preop.diagnosis", "String must contain at most 1000 character(s)"))
      .toBe("Not saved — String must contain at most 1000 character(s)")
  })

  it("still says something useful with no range and no message", () => {
    expect(describeRejection("preop.somethingNew")).toBe("Not saved — value not accepted")
  })

  it("accepts a translated label", () => {
    expect(describeRejection("preop.heightCm", undefined, "Не е запазено"))
      .toBe("Не е запазено — must be 30–250 cm")
  })
})

describe("rejectedFieldKeys / rejectionMessages", () => {
  it("produces the keys the form flags", () => {
    const keys = rejectedFieldKeys([{ path: "preop.heightCm" }, { path: "preop.weightKg" }])
    expect(keys).toEqual(new Set(["heightCm", "weightKg"]))
  })

  it("maps one message per field", () => {
    const msgs = rejectionMessages([{ path: "preop.heightCm" }, { path: "preop.ageYears" }])
    expect(msgs.get("heightCm")).toContain("30–250")
    expect(msgs.get("ageYears")).toContain("0–149")
  })

  it("keeps the first message when a field is rejected twice", () => {
    const msgs = rejectionMessages([{ path: "preop.heightCm" }, { path: "heightCm" }])
    expect(msgs.size).toBe(1)
  })

  it("returns empty structures for an empty list", () => {
    expect(rejectedFieldKeys([]).size).toBe(0)
    expect(rejectionMessages([]).size).toBe(0)
  })
})
