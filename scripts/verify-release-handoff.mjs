import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { sha256File } from "./release-artifacts-lib.mjs"
import { parseReleaseHandoff } from "./release-handoff-lib.mjs"

const [handoffArg, lockArg, version, commit, runId, runAttempt] = process.argv.slice(2)
if (!handoffArg || !lockArg || !version || !commit || !runId || !runAttempt) {
  throw new Error("Usage: node scripts/verify-release-handoff.mjs <publication-request.tsv> <release.lock> <version> <commit> <run-id> <run-attempt>")
}
const [handoffText, lockDetails, lockSha256] = await Promise.all([
  readFile(resolve(handoffArg), "utf8"),
  stat(resolve(lockArg)),
  sha256File(resolve(lockArg)),
])
const handoff = parseReleaseHandoff(handoffText)
if (handoff.version !== version || handoff.commit !== commit || handoff.runId !== String(runId) || handoff.runAttempt !== String(runAttempt)) {
  throw new Error("publication request does not match the requested candidate run")
}
if (handoff.lockBytes !== lockDetails.size || handoff.lockSha256 !== lockSha256) {
  throw new Error("publication request does not match the downloaded release lock")
}
console.log(`Release publication request verified for ${handoff.tag} run ${handoff.runId}/${handoff.runAttempt}`)
