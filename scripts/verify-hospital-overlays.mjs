#!/usr/bin/env node
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyHospitalOverlays } from "./hospital-overlay-lib.mjs"

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url))
const args = process.argv.slice(2)
let root = repositoryRoot
let json = false

while (args.length) {
  const value = args.shift()
  if (value === "--json") {
    json = true
  } else if (value === "--root") {
    const candidate = args.shift()
    if (!candidate) throw new Error("--root requires a path")
    root = resolve(candidate)
  } else {
    throw new Error(`Unknown option '${value}'`)
  }
}

const report = verifyHospitalOverlays(root)
if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else if (report.ok) {
  process.stdout.write(`Hospital overlay verification passed (${report.summary.passed}/${report.summary.total}).\n`)
} else {
  process.stderr.write(`Hospital overlay verification failed (${report.summary.failed}/${report.summary.total}):\n`)
  for (const failure of report.failures) {
    process.stderr.write(`  - ${failure.id} [${failure.path}]: ${failure.message}\n`)
  }
}
if (!report.ok) process.exitCode = 1
