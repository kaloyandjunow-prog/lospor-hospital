import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("registration institution requirement", () => {
  const source = readFileSync(resolve(process.cwd(), "app/(auth)/register.tsx"), "utf8")

  it("requires an institution and never describes it as optional in English or Bulgarian", () => {
    expect(source).toContain('institutionId: z.string().min(1, "Required")')
    expect(source).toContain('"Институция *"')
    expect(source).toContain('"Institution *"')
    expect(source).not.toMatch(/Institution \(optional\)|Институц[^\n]*незадълж/i)
  })
})
