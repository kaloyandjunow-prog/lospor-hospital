#!/usr/bin/env node
// Whether the exact commit a release tag points at already passed the full
// Hospital quality gate (1.5.0).
//
//   node scripts/quality-already-passed.mjs <repository> <commit-sha>
//
// Prints "reuse <run-url>" or "run". A release tag sits on a commit that was
// pushed to main first, and that push already ran quality.yml to completion;
// running the same 25-minute gate again on the same bytes proved nothing new.
// Same commit means the same tree, so the same quality.yml and the same tests.
//
// Only a successful push run of this repository's quality.yml at exactly this
// commit counts. Anything else -- no run yet, still running, failed, cancelled,
// a pull-request run (a different merge commit), another workflow -- prints
// "run", and the release runs the gate itself as before.

import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

export const QUALITY_WORKFLOW = ".github/workflows/quality.yml"

/** The successful quality run for this commit, from GitHub's runs listing, or null. */
export function reusableQualityRun(listing, { repository, commit }) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? "")) throw new Error("commit must be a full lowercase Git SHA")
  const runs = Array.isArray(listing?.workflow_runs) ? listing.workflow_runs : []
  return runs.find(run =>
    run?.repository?.full_name === repository
    && run.path === QUALITY_WORKFLOW
    && run.event === "push"
    && run.head_sha === commit
    && run.status === "completed"
    && run.conclusion === "success",
  ) ?? null
}

function main() {
  const [repository, commit, ...extra] = process.argv.slice(2)
  if (!repository || !commit || extra.length > 0) {
    console.error("Usage: node scripts/quality-already-passed.mjs <owner/repository> <commit-sha>")
    process.exit(2)
  }
  const result = spawnSync("gh", [
    "api", `repos/${repository}/actions/workflows/quality.yml/runs?head_sha=${commit}&event=push&status=success&per_page=100`,
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  // Asking GitHub is an optimisation. If it cannot answer, run the gate.
  if (result.status !== 0) {
    console.log("run")
    return
  }
  let listing
  try {
    listing = JSON.parse(result.stdout)
  } catch {
    console.log("run")
    return
  }
  const run = reusableQualityRun(listing, { repository, commit })
  console.log(run ? `reuse ${run.html_url}` : "run")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
