import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// The zod schema (with its own required-institution rule) and the field
// label/required-asterisk composition live in different files now --
// registration-schema.ts and register.tsx respectively -- so this reads both
// rather than one hardcoded literal-string screen.
describe("registration institution requirement", () => {
  const schema = readFileSync(resolve(process.cwd(), "src/lib/registration-schema.ts"), "utf8")
  const source = readFileSync(resolve(process.cwd(), "app/(auth)/register.tsx"), "utf8")
  const en = readFileSync(resolve(process.cwd(), "src/i18n/strings.ts"), "utf8")

  it("requires an institution and never describes it as optional in English or Bulgarian", () => {
    expect(schema).toMatch(/institutionId:\s*z\.string\(\)\.min\(1,/)
    expect(source).toContain('<Field label={t("institution")} required')
    expect(en).toMatch(/institution:\s*"Institution"/)
    expect(en).toContain('institution: "Институция"')
    expect(source).not.toMatch(/Institution \(optional\)|Институц[^\n]*незадълж/i)
  })
})
