import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { verifyReleaseAssetSet, verifyReleaseCandidate } from "./release-candidate-lib.mjs"

const [version, artifactDirectory, mode = "all", expectedCommit] = process.argv.slice(2)
if (!version || !artifactDirectory || !["metadata", "all", "candidate-assets", "final-assets"].includes(mode)) {
  throw new Error("Usage: node scripts/verify-release-candidate.mjs <version> <artifact-directory> <metadata|all|candidate-assets|final-assets> [expected-commit]")
}
const directory = resolve(artifactDirectory)
const prefix = `lospor-hospital-${version}`
const paths = {
  manifestPath: resolve(directory, `${prefix}-manifest.json`),
  lockPath: resolve(directory, `${prefix}-release.lock`),
  checksumPath: resolve(directory, `${prefix}-release.lock.sha256`),
  imageLockPath: mode === "final-assets" ? undefined : resolve(directory, `${prefix}-images.json`),
}
const result = await verifyReleaseCandidate({
  version,
  artifactDirectory: directory,
  expectedCommit,
  verifyArtifacts: mode !== "metadata",
  ...paths,
})
if (mode === "candidate-assets") await verifyReleaseAssetSet(directory, result.manifest, "candidate")
if (mode === "final-assets") await verifyReleaseAssetSet(directory, result.manifest, "final")
console.log(`Release candidate ${version} verified at lock sha256:${result.lockSha256}`)
