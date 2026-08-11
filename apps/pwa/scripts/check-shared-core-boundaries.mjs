import { readdir, readFile } from "node:fs/promises"
import { basename, extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const sourceRoots = ["app", "src"]
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"])
const ignoredDirectories = new Set(["generated", "node_modules", ".expo", "dist", "coverage"])

const forbiddenArrayDeclarations = [
  "DRUG_CATS",
  "INF_DRUGS",
  "FLUID_LIST",
  "VOLATILE_AGENTS",
]
const forbiddenDeclarations = [
  "TECHNIQUE_FAVORITES",
  "HANDOVER_CODE_ALIASES",
  "HANDOVER_GROUPS_EN",
  "HANDOVER_GROUPS_BG",
  "LAB_CATALOG",
  "ICD10_BODY_SYSTEMS",
  "rcriRiskBand",
  "apfelRiskBand",
  "stopBangRiskBand",
]

const rules = [
  {
    description: "legacy client-owned option-library import",
    pattern: /(?:from\s+|require\()\s*["'][^"']*(?:data\/option-library|option-library-fallback)/,
  },
  {
    description: "hardcoded clinical option array",
    pattern: new RegExp(
      String.raw`\b(?:const|let|var)\s+(?:${forbiddenArrayDeclarations.join("|")})\s*=\s*\[`,
    ),
  },
  {
    description: "shared clinical declaration",
    pattern: new RegExp(
      String.raw`\b(?:const|let|var)\s+(?:${forbiddenDeclarations.join("|")})\b`,
    ),
  },
  {
    description: "shared clinical threshold function",
    pattern: /\bfunction\s+(?:rcriRiskBand|apfelRiskBand|stopBangRiskBand)\b/,
  },
  {
    description: "hardcoded five-minute timetable column arithmetic",
    pattern: /\b(?:col|colIdx|startCol|endCol)\s*\*\s*5\b|\bINTERVAL\s*=\s*5\b/,
  },
]

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else if (extensions.has(extname(entry.name))) files.push(path)
  }
  return files
}

const violations = []
for (const sourceRoot of sourceRoots) {
  const files = await filesUnder(join(root, sourceRoot))
  for (const file of files) {
    if (basename(file) === "option-library-fallback.json") {
      violations.push(`${relative(root, file)}: copied fallback catalog`)
      continue
    }
    const source = await readFile(file, "utf8")
    for (const rule of rules) {
      const match = rule.pattern.exec(source)
      if (!match) continue
      const line = source.slice(0, match.index).split(/\r?\n/).length
      violations.push(`${relative(root, file)}:${line}: ${rule.description}`)
    }
  }
}

// ── Component size ratchet ───────────────────────────────────────────────────
//
// Mobile is the better-factored of the two implementations and it should stay
// that way. A ratchet rather than a limit: files already over budget are
// recorded at their current size and may only shrink, while anything new must
// arrive under COMPONENT_LINE_BUDGET. A limit that failed on day one would just
// be suppressed.

const COMPONENT_LINE_BUDGET = 400
const budgetPath = join(root, "scripts", "component-size-budget.json")
const budget = JSON.parse(await readFile(budgetPath, "utf8"))
const shrunk = []

for (const sourceRoot of sourceRoots) {
  for (const file of await filesUnder(join(root, sourceRoot))) {
    if (extname(file) !== ".tsx") continue
    const relativePath = relative(root, file).replaceAll("\\", "/")
    const lines = (await readFile(file, "utf8")).split(/\r?\n/).length
    const allowed = budget[relativePath]

    if (allowed === undefined) {
      if (lines > COMPONENT_LINE_BUDGET) {
        violations.push(
          `${relativePath}: ${lines} lines exceeds the ${COMPONENT_LINE_BUDGET}-line budget for a new component`,
        )
      }
      continue
    }
    if (lines > allowed) {
      violations.push(
        `${relativePath}: grew to ${lines} lines, budgeted at ${allowed}. `
        + "Split it, or move logic to core, rather than raising the budget.",
      )
    } else if (lines < allowed) {
      shrunk.push(`${relativePath}: ${lines} lines, budgeted at ${allowed}`)
    }
  }
}

if (violations.length > 0) {
  console.error("Shared Core boundary violations:")
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log("Shared Core boundaries OK")
}

if (shrunk.length > 0) {
  console.log(`\n${shrunk.length} component(s) now under budget — tighten scripts/component-size-budget.json:`)
  for (const entry of shrunk) console.log(`  ${entry}`)
}
