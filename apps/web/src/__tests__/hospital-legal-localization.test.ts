import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const legalPages = [
  "src/app/(auth)/terms/page.tsx",
  "src/app/(auth)/privacy/page.tsx",
]

describe("Hospital legal-page localization", () => {
  it("uses Bulgarian generic ИИ terminology and localized browser titles", () => {
    const source = legalPages
      .map(file => fs.readFileSync(path.resolve(file), "utf8"))
      .join("\n")

    expect(source).toContain("Условия за ползване - LOSPOR Hospital")
    expect(source).toContain("Известие за поверителност - LOSPOR Hospital")
    expect(source).toContain("функции с ИИ")
    expect(source).toContain("услуги с ИИ")
    expect(source).not.toMatch(/[А-Яа-я][^\n\"]*\bAI\b|\bAI\b[^\n\"]*[А-Яа-я]/)
  })
})
