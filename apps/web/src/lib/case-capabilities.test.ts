import { describe, expect, it } from "vitest"
import { caseIsWritable } from "./case-capabilities"

describe("caseIsWritable", () => {
  it("grants write only on an explicit true", () => {
    expect(caseIsWritable({ capabilities: { canRead: true, canWrite: true, isCreator: true, isAssignee: true } }))
      .toBe(true)
  })

  it("refuses the creator of a handed-on case", () => {
    expect(caseIsWritable({ capabilities: { canRead: true, canWrite: false, isCreator: true, isAssignee: false } }))
      .toBe(false)
  })

  it.each([
    ["no capabilities key", {}],
    ["a null capabilities value", { capabilities: null }],
    ["capabilities that are not an object", { capabilities: "all" }],
    ["a canWrite that is merely truthy", { capabilities: { canWrite: "yes" } }],
    ["a missing canWrite", { capabilities: { canRead: true } }],
    ["a null case", null],
    ["a string body", "forbidden"],
  ])("reads %s as read-only", (_label, source) => {
    expect(caseIsWritable(source)).toBe(false)
  })
})
