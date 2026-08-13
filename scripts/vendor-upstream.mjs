#!/usr/bin/env node
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  SOURCES,
  VendorError,
  applyVendorStage,
  checkVendorMerge,
  stageVendorMerge,
  writeJsonReport,
} from "./vendor-upstream-engine.mjs"

const root = fileURLToPath(new URL("..", import.meta.url))

function usage() {
  return [
    "Usage:",
    `  node scripts/vendor-upstream.mjs <${Object.keys(SOURCES).join("|")}> <X.Y.Z> --check [--json-report <new-file>]`,
    `  node scripts/vendor-upstream.mjs <${Object.keys(SOURCES).join("|")}> <X.Y.Z> --stage <new-directory> [--json-report <new-file>]`,
    "  node scripts/vendor-upstream.mjs --apply <stage-directory> [--json-report <new-file>]",
    "",
    "The command reads existing local upstream clones only. It never fetches,",
    "pushes, edits an upstream clone, or changes UPSTREAM_VERSIONS.json.",
  ].join("\n")
}

function parseArguments(argv) {
  const values = [...argv]
  let mode = null
  let stagePath = null
  let reportPath = null
  const positional = []
  while (values.length) {
    const value = values.shift()
    if (value === "--check") {
      if (mode) throw new VendorError("INVALID_USAGE", "Choose exactly one mode")
      mode = "check"
    } else if (value === "--stage" || value === "--apply") {
      if (mode) throw new VendorError("INVALID_USAGE", "Choose exactly one mode")
      mode = value.slice(2)
      stagePath = values.shift()
      if (!stagePath) throw new VendorError("INVALID_USAGE", `${value} requires a path`)
    } else if (value === "--json-report") {
      reportPath = values.shift()
      if (!reportPath) throw new VendorError("INVALID_USAGE", "--json-report requires a path")
    } else if (value?.startsWith("--")) {
      throw new VendorError("INVALID_USAGE", `Unknown option ${value}`)
    } else {
      positional.push(value)
    }
  }
  if (!mode) throw new VendorError("INVALID_USAGE", "A mode is required")
  if (mode === "apply") {
    if (positional.length) throw new VendorError("INVALID_USAGE", "--apply reads source and version from the stage")
  } else if (positional.length !== 2) {
    throw new VendorError("INVALID_USAGE", "--check and --stage require a source and X.Y.Z version")
  }
  return {
    mode,
    sourceName: positional[0],
    targetVersion: positional[1],
    stagePath,
    reportPath,
  }
}

function printReport(report) {
  if (report.mode === "apply") {
    process.stdout.write(`${report.source}: applied ${report.targetVersion} to ${report.sourcePath}\n`)
    if (report.retainedBackup) {
      process.stdout.write(`Warning: old tree retained at ${report.retainedBackup}\n`)
    }
    process.stdout.write("UPSTREAM_VERSIONS.json was not changed; review, commit, then stamp separately.\n")
    return
  }
  process.stdout.write(
    `${report.source}: ${report.base.version} -> ${report.targetVersion}: ${report.status}\n`,
  )
  process.stdout.write(`Upstream changed ${report.upstreamChanges.length} file(s).\n`)
  if (report.conflicts.length) {
    process.stdout.write(`Conflicts (${report.conflicts.length}):\n`)
    for (const path of report.conflicts) process.stdout.write(`  ${path}\n`)
  } else {
    process.stdout.write(`Result changes ${report.resultChanges.length} file(s).\n`)
  }
  if (report.stagePath) process.stdout.write(`Review stage: ${report.stagePath}\n`)
}

let parsed
try {
  parsed = parseArguments(process.argv.slice(2))
  const upstreamRoot = process.env.LOSPOR_UPSTREAM_ROOT ?? join(root, "..", "LOSPOR")
  const common = { root, upstreamRoot }
  const report = parsed.mode === "check"
    ? checkVendorMerge({ ...common, sourceName: parsed.sourceName, targetVersion: parsed.targetVersion })
    : parsed.mode === "stage"
      ? stageVendorMerge({
          ...common,
          sourceName: parsed.sourceName,
          targetVersion: parsed.targetVersion,
          stagePath: parsed.stagePath,
        })
      : applyVendorStage({ ...common, stagePath: parsed.stagePath })
  if (parsed.reportPath) writeJsonReport(parsed.reportPath, report)
  printReport(report)
  if (report.status === "conflicts") process.exitCode = 2
} catch (error) {
  const report = {
    schemaVersion: 1,
    mode: parsed?.mode ?? "invalid",
    status: "error",
    error: {
      code: error instanceof VendorError ? error.code : "UNEXPECTED_ERROR",
      message: error.message,
      ...(error instanceof VendorError ? { details: error.details } : {}),
    },
  }
  if (parsed?.reportPath && !existsSync(parsed.reportPath)) {
    try {
      writeJsonReport(parsed.reportPath, report)
    } catch (reportError) {
      process.stderr.write(`Could not write failure report: ${reportError.message}\n`)
    }
  }
  process.stderr.write(`${report.error.code}: ${report.error.message}\n`)
  if (report.error.code === "INVALID_USAGE") process.stderr.write(`${usage()}\n`)
  process.exitCode = 1
}
