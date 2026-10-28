import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const generatedFiles = execFileSync(
  "git",
  ["diff", "--name-only", "--", "apps/api/src/generated/prisma"],
  { cwd: repositoryRoot, encoding: "utf8" },
)
  .split(/\r?\n/)
  .filter(path => path.endsWith(".ts"))
  .map(path => resolve(repositoryRoot, path))

let normalized = 0
for (const path of generatedFiles) {
  const before = readFileSync(path, "utf8")
  const after = before.replace(/[ \t]+(?=\r?\n)/g, "")
  if (after === before) continue
  writeFileSync(path, after)
  normalized += 1
}

console.log(`Prisma generated output normalized (${normalized} file${normalized === 1 ? "" : "s"}).`)
