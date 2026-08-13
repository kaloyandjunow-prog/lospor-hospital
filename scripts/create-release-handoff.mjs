import { stat, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { sha256File } from "./release-artifacts-lib.mjs"
import { OFFICIAL_REPOSITORY, CANDIDATE_WORKFLOW, serializeReleaseHandoff } from "./release-handoff-lib.mjs"

const [version, commit, runId, runAttempt, lockArg, outputArg] = process.argv.slice(2)
if (!version || !commit || !runId || !runAttempt || !lockArg || !outputArg) {
  throw new Error("Usage: node scripts/create-release-handoff.mjs <version> <commit> <run-id> <run-attempt> <release.lock> <output.tsv>")
}
const lock = resolve(lockArg)
const details = await stat(lock)
const handoff = serializeReleaseHandoff({
  repository: OFFICIAL_REPOSITORY,
  workflow: CANDIDATE_WORKFLOW,
  runId,
  runAttempt,
  version,
  tag: `hospital-${version}`,
  commit,
  lockFile: `lospor-hospital-${version}-release.lock`,
  lockBytes: details.size,
  lockSha256: await sha256File(lock),
})
await writeFile(resolve(outputArg), handoff, { encoding: "utf8", flag: "wx" })
console.log(`Release publication request written: ${resolve(outputArg)}`)
