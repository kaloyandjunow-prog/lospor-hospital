import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Hospital PWA audit privacy surface", () => {
  it("does not render raw details, entity identifiers, or server error prose", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../app/(app)/audit-logs.tsx"), "utf8")
    expect(source).not.toContain("item.entityId")
    expect(source).not.toContain("item.detail")
    expect(source).not.toContain("JSON.stringify(detail)")
    expect(source).not.toContain("err.message")
    expect(source).toContain("auditActionLabel(actions, item.action, language")
  })
})
