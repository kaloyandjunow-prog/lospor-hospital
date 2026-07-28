import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import en from "../../messages/en.json"
import bg from "../../messages/bg.json"

// The whole `intraop.timetable.*` namespace was missing from both language
// files, so next-intl rendered the raw key path — clinicians saw
// "intraop.timetable.drugs" as a row label on the live chart. Nothing failed;
// it just looked like the database had leaked into the UI.
//
// This walks the source for literal t("…") keys and asserts each one resolves
// in both languages, so a label can never ship untranslated again.

const SRC = path.join(__dirname, "..")

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!/node_modules|generated|__tests__/.test(full)) sourceFiles(full, acc)
    } else if (/\.tsx?$/.test(full) && !/\.test\./.test(full)) {
      acc.push(full)
    }
  }
  return acc
}

function resolve(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
    messages,
  )
}

/** Literal translation keys used in the source, with their namespace applied. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  for (const file of sourceFiles(SRC)) {
    const src = fs.readFileSync(file, "utf8")
    if (!/useTranslations|getTranslations/.test(src)) continue

    // A file scoped to exactly one namespace has it prefixed onto every key.
    // Files with several (or a dynamic one) are read as full paths, which is
    // how this codebase writes them.
    const namespaces = [...src.matchAll(/(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g)].map(m => m[1])
    const prefix = namespaces.length === 1 ? `${namespaces[0]}.` : ""

    for (const match of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
      const key = prefix + match[1]
      if (key.includes(".")) keys.set(key, path.relative(SRC, file))
    }
  }
  return keys
}

describe("translation keys", () => {
  const keys = usedKeys()

  it("finds keys to check (guards against the scan silently matching nothing)", () => {
    expect(keys.size).toBeGreaterThan(100)
  })

  it("every key used in the UI exists in English", () => {
    const missing = [...keys].filter(([k]) => resolve(en, k) === undefined)
      .map(([k, file]) => `${k} (${file})`)
    expect(missing).toEqual([])
  })

  it("every key used in the UI exists in Bulgarian", () => {
    const missing = [...keys].filter(([k]) => resolve(bg, k) === undefined)
      .map(([k, file]) => `${k} (${file})`)
    expect(missing).toEqual([])
  })

  it("resolves to strings, not to a nested object left half-filled", () => {
    const notStrings = [...keys]
      .filter(([k]) => {
        const v = resolve(en, k)
        return v !== undefined && typeof v !== "string"
      })
      .map(([k]) => k)
    expect(notStrings).toEqual([])
  })
})
