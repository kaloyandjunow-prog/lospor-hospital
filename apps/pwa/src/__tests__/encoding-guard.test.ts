import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guards against cp1251 mojibake — UTF-8 Cyrillic bytes decoded as cp1251 and
 * re-saved, which turns "·" into "В·" and Bulgarian text into "Р°С‚..." noise.
 *
 * This has happened twice in this codebase. The second time it corrupted the
 * dose-selector hint shown *during a live case*, and typecheck, lint and the
 * whole test suite passed with it present: no other gate can see encoding damage.
 *
 * The patterns below are deliberately two-character sequences that cannot occur
 * in real Bulgarian. A naive "contains Cyrillic Р or С" check flags the entire
 * legitimate translation set — that false positive cost an investigation once
 * already, so keep this list specific.
 */
const MOJIBAKE = [
  "В·", // · (middle dot) mis-decoded — the exact damage seen twice
  "вЂ", // prefix of mis-decoded en/em dashes and smart quotes
  "Р°", "Р±", "Р²", "Р³", "Р´", "Рµ", "Рё", "Рє", "Р»", "Рј", "РЅ", "Рѕ", "Рї",
  "СЂ", "СЃ", "С‚", "Сѓ", "С„", "С…", "С†", "С‡", "СЊ", "СЋ", "СЏ",
  "Г—", // × mis-decoded
]

const ROOTS = ["src", "app"]
const SKIP_DIRS = new Set(["node_modules", ".next", "generated", "dist", "coverage"])
const EXTENSIONS = [".ts", ".tsx", ".json", ".md"]

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (EXTENSIONS.some(ext => entry.endsWith(ext))) out.push(full)
  }
  return out
}

describe("source encoding", () => {
  it("contains no cp1251 mojibake", () => {
    const root = process.cwd()
    const offences: string[] = []

    for (const rootDir of ROOTS) {
      for (const file of sourceFiles(join(root, rootDir))) {
        // This test file necessarily contains the patterns it searches for.
        if (file.endsWith("encoding-guard.test.ts")) continue
        const lines = readFileSync(file, "utf8").split(/\r?\n/)
        lines.forEach((line, index) => {
          const hit = MOJIBAKE.find(pattern => line.includes(pattern))
          if (hit) {
            offences.push(`${relative(root, file)}:${index + 1} contains "${hit}"`)
          }
        })
      }
    }

    expect(offences, `Mojibake found:\n${offences.join("\n")}`).toEqual([])
  })
})
