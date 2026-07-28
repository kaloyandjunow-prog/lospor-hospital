import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const sourceRoot = join(root, "src")
const forbidden = [
  {
    description: "framework or database import",
    pattern: /from\s+["'](?:react|react-native|expo(?:\/[^"']*)?|next(?:\/[^"']*)?|@prisma\/[^"']+|server-only)["']/,
  },
  {
    description: "browser or device storage",
    pattern: /\b(?:localStorage|sessionStorage|indexedDB|AsyncStorage|SecureStore)\b/,
  },
  {
    description: "network implementation",
    pattern: /\bfetch\s*\(/,
  },
]

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else if (extname(entry.name) === ".ts") files.push(path)
  }
  return files
}

const violations = []
for (const file of await filesUnder(sourceRoot)) {
  const source = await readFile(file, "utf8")
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
  for (const rule of forbidden) {
    const match = rule.pattern.exec(code)
    if (!match) continue
    const line = code.slice(0, match.index).split(/\r?\n/).length
    violations.push(`${relative(root, file)}:${line}: ${rule.description}`)
  }
}

if (violations.length) {
  console.error("Core boundary violations:")
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log("Core boundaries OK")
}
