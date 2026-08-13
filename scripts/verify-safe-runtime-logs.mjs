import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const runtimeRoots = [
  "apps/api/src",
  "apps/web/src",
  "apps/pwa/app",
  "apps/pwa/src",
  "apps/browser/src",
  "apps/status/src",
]
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])
const literal = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?![^\x60]*\$\{)[^\x60]*\x60)`
const allowedDynamicFact = String.raw`(?:[A-Za-z_$][\w$]*\.status|operation|failureKind)`
const allowedArguments = new RegExp(`^\\s*${literal}(?:\\s*,\\s*${allowedDynamicFact})?\\s*$`)
const problems = []

async function visit(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    const portable = relative(root, path).replaceAll("\\", "/")
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue
      await visit(path)
      continue
    }
    if (!extensions.has(extname(entry.name)) || /\.(?:test|spec)\.[^.]+$/.test(entry.name)) continue
    const lines = (await readFile(path, "utf8")).split(/\r\n|\r|\n/)
    lines.forEach((line, index) => {
      if (!/console\.(?:log|warn|error)\s*\(/.test(line)) return
      const match = /console\.(?:log|warn|error)\s*\((.*)\)/.exec(line)
      if (!match || !allowedArguments.test(match[1])) {
        problems.push(`${portable}:${index + 1} must log only a fixed code and an optional safe enum/status`)
      }
    })
  }
}

for (const directory of runtimeRoots) await visit(join(root, directory))

if (problems.length) {
  process.stderr.write(`Runtime log privacy boundary failed:\n${problems.map(item => `  - ${item}`).join("\n")}\n`)
  process.exit(1)
}
process.stdout.write("Runtime log privacy boundary OK: no bodies, objects, identifiers or free text are logged.\n")
