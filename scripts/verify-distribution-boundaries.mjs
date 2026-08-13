import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { distributionBoundaryProblems } from "./distribution-boundaries-lib.mjs"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const output = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
})
const paths = output.split("\0").filter(Boolean)
const contents = new Map()

for (const path of paths) {
  // Private-key headers are short ASCII markers. Avoid loading generated or
  // vendored binary assets merely to scan for them.
  if (!/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|zip|gz|tar|pdf)$/i.test(path)) {
    const value = await readFile(resolve(root, path), "utf8").catch(() => null)
    if (value !== null) contents.set(path, value)
  }
}

const problems = distributionBoundaryProblems(paths, contents)
if (problems.length) {
  process.stderr.write(`Distribution boundary failed:\n${problems.map(item => `  - ${item}`).join("\n")}\n`)
  process.exit(1)
}

process.stdout.write(`Distribution boundary OK: ${paths.length} tracked paths contain no runtime secrets or private state.\n`)
