import assert from "node:assert/strict"
import test from "node:test"
import { QUALITY_WORKFLOW, reusableQualityRun } from "./quality-already-passed.mjs"

const REPOSITORY = "kaloyandjunow-prog/lospor-hospital"
const COMMIT = "0123456789abcdef0123456789abcdef01234567"
const passed = {
  repository: { full_name: REPOSITORY },
  path: QUALITY_WORKFLOW,
  event: "push",
  head_sha: COMMIT,
  status: "completed",
  conclusion: "success",
  html_url: "https://github.com/run/1",
}
const find = runs => reusableQualityRun({ workflow_runs: runs }, { repository: REPOSITORY, commit: COMMIT })

test("reuses a successful push run of quality.yml at exactly the tagged commit", () => {
  assert.equal(find([passed])?.html_url, "https://github.com/run/1")
})

test("runs the gate for anything that is not that", () => {
  for (const change of [
    { head_sha: "f".repeat(40) },
    { event: "pull_request" },
    { event: "workflow_dispatch" },
    { path: ".github/workflows/release.yml" },
    { repository: { full_name: "someone/fork" } },
    { status: "in_progress", conclusion: null },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
  ]) {
    assert.equal(find([{ ...passed, ...change }]), null, JSON.stringify(change))
  }
  assert.equal(find([]), null)
  assert.equal(reusableQualityRun({}, { repository: REPOSITORY, commit: COMMIT }), null)
})

test("refuses a commit that is not a full SHA", () => {
  assert.throws(() => reusableQualityRun({ workflow_runs: [passed] }, { repository: REPOSITORY, commit: "0123456" }), /full lowercase Git SHA/)
})
