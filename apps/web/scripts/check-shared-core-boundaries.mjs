import { readdir, readFile } from "node:fs/promises"
import { basename, extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const sourceRoots = ["src"]
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"])
const ignoredDirectories = new Set(["generated", "node_modules", ".next", "dist", "coverage"])

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
  {
    description: "database implementation belongs in lospor-api",
    pattern: /(?:@prisma\/client|@\/generated\/prisma|@\/lib\/prisma)/,
  },
  {
    description: "authentication implementation belongs in lospor-api",
    pattern: /(?:from\s+["']next-auth|@auth\/prisma-adapter)/,
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
    const relativePath = relative(root, file).replaceAll("\\", "/")
    if (relativePath.startsWith("src/app/api/")) {
      violations.push(`${relativePath}: API implementation belongs in lospor-api`)
      continue
    }
    if (basename(file) === "option-library-fallback.json") {
      violations.push(`${relativePath}: copied fallback catalog`)
      continue
    }
    const source = await readFile(file, "utf8")
    for (const rule of rules) {
      const match = rule.pattern.exec(source)
      if (!match) continue
      const line = source.slice(0, match.index).split(/\r?\n/).length
      violations.push(`${relativePath}:${line}: ${rule.description}`)
    }
  }
}

// ── Component size ratchet ───────────────────────────────────────────────────
//
// A 4,000-line component is not a style problem. It is where the intraop bugs
// come from, and it got that way one plausible addition at a time with nothing
// ever saying stop.
//
// This is a ratchet rather than a limit, because a limit that fails on day one
// gets suppressed and then ignored. Files already over budget are recorded at
// their current size and may only shrink; anything new must come in under
// COMPONENT_LINE_BUDGET. Shrinking a file below its recorded budget is reported
// so the entry can be tightened, which is how the list empties.

const COMPONENT_LINE_BUDGET = 400
const budgetPath = join(root, "scripts", "component-size-budget.json")
const budget = JSON.parse(await readFile(budgetPath, "utf8"))
const shrunk = []

for (const file of await filesUnder(join(root, "src"))) {
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

for (const relativePath of Object.keys(budget)) {
  const exists = await readFile(join(root, relativePath), "utf8").then(() => true, () => false)
  if (!exists) shrunk.push(`${relativePath}: gone; remove it from the budget`)
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
