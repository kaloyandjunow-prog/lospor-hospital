import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Hospital Web audit privacy surface", () => {
  it("does not render raw detail or entity identifiers", () => {
    const source = readFileSync(resolve(
      import.meta.dirname,
      "../app/(app)/admin/page.tsx",
    ), "utf8")
    expect(source).not.toContain("l.entityId")
    expect(source).not.toContain("l.detail")
    expect(source).not.toContain("JSON.stringify(l.detail)")
    expect(source).toContain("auditActionLabel(actions, l.action, locale")
  })
})
