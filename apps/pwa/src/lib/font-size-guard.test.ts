import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// TACH-MATRICA: text is never under 12 px on the phone either (10.8.0). The guard keeps 8-11 from coming back.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "test" ? [] : sources(path)
    return /\.(tsx|ts)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
}

describe("text size", () => {
  it("is never under 12", () => {
    const root = join(__dirname, "..", "..")
    const offenders = [...sources(join(root, "src")), ...sources(join(root, "app"))].flatMap(file => {
      const found = readFileSync(file, "utf8").match(/fontSize: ?(?:[0-9]|1[01])(?![0-9])|fontSize:[^,}]*[?:] ?(?:[0-9]|1[01])(?![0-9])/g)
      return found ? [`${file.replace(root, "")}: ${found.join(", ")}`] : []
    })
    expect(offenders).toEqual([])
  })
})
