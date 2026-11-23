import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The touch matrix's guard (10.8.0): text is never under 12 px on a screen, and
 * the shared controls are 44 px. The printed sheets are A4 and keep their
 * own sizes (records, the pre-op summary, print routes).
 */
const SRC = join(__dirname, "..")
const PRINT = /[\\/](components[\\/]record|components[\\/]preop-summary|print|pdf)[\\/]/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe("touch matrix guard", () => {
  it("draws no text under 12 px outside the printed sheets", () => {
    const offenders = files(SRC)
      .filter(path => !PRINT.test(path))
      .flatMap(path => [...readFileSync(path, "utf8").matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
        .filter(match => Number(match[1]) < 12)
        .map(match => `${relative(SRC, path)}: ${match[0]}`))
    expect(offenders).toEqual([])
  })

  it("keeps the shared button, input and tabs at the 44 px target", () => {
    const button = readFileSync(join(SRC, "components/ui/button.tsx"), "utf8")
    expect(button).toContain(`"h-11 gap-1.5`)
    expect(button).toContain(`icon: "size-11"`)
    expect(readFileSync(join(SRC, "components/ui/input.tsx"), "utf8")).toContain(`"h-11 w-full`)
    expect(readFileSync(join(SRC, "components/ui/tabs.tsx"), "utf8")).toContain("group-data-horizontal/tabs:h-11")
  })
})
