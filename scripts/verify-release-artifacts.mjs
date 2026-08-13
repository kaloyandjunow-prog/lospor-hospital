import { readFile, stat } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import {
  assertReleaseLockChecksum,
  assertReleaseLockMatchesManifest,
  parseReleaseManifest,
  serializeManifest,
  sha256File,
} from "./release-artifacts-lib.mjs"

const [manifestPath, lockPath, checksumPath, artifactDirectory = dirname(resolve(manifestPath ?? "."))] = process.argv.slice(2)
if (!manifestPath || !lockPath || !checksumPath) {
  throw new Error("Usage: node scripts/verify-release-artifacts.mjs <manifest.json> <release.lock> <release.lock.sha256> [artifact-directory]")
}
const lockFilename = basename(lockPath)
if (basename(checksumPath) !== `${lockFilename}.sha256`) {
  throw new Error(`Release-lock checksum must be named ${lockFilename}.sha256`)
}
const [manifestBytes, lockBytes, checksumBytes] = await Promise.all([
  readFile(manifestPath),
  readFile(lockPath),
  readFile(checksumPath),
])
const lockSha256 = assertReleaseLockChecksum(lockBytes, checksumBytes, lockFilename)
const manifest = parseReleaseManifest(JSON.parse(manifestBytes.toString("utf8")))
if (!manifestBytes.equals(Buffer.from(serializeManifest(manifest)))) throw new Error("Release JSON manifest is not canonical")
assertReleaseLockMatchesManifest(lockBytes, manifest)
const artifacts = [manifest.artifacts.deployment, manifest.artifacts.securityEvidence, ...manifest.artifacts.offlineImages]
for (const artifact of artifacts) {
  const path = resolve(artifactDirectory, artifact.file)
  const details = await stat(path)
  if (details.size !== artifact.bytes) throw new Error(`Artifact size mismatch: ${artifact.file}`)
  if (await sha256File(path) !== artifact.sha256) throw new Error(`Artifact checksum mismatch: ${artifact.file}`)
}
console.log(`Release ${manifest.appliance.version} JSON, lock and artifacts verified with release-lock sha256:${lockSha256}`)
