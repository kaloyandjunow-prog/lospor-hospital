import { readFile, readdir, stat } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import {
  assertReleaseLockMatchesManifest,
  parseReleaseManifest,
  serializeManifest,
  sha256File,
  validateImageLock,
  validateVersion,
} from "./release-artifacts-lib.mjs"

function sameImage(left, right) {
  return left.name === right.name
    && left.reference === right.reference
    && left.digest === right.digest
    && left.imageId === right.imageId
    && left.platform === right.platform
    && left.immutableReference === right.immutableReference
}

export async function verifyReleaseCandidate({
  version,
  manifestPath,
  lockPath,
  checksumPath = `${resolve(lockPath)}.sha256`,
  imageLockPath,
  artifactDirectory = dirname(resolve(manifestPath)),
  expectedCommit,
  verifyArtifacts = true,
}) {
  const expectedVersion = validateVersion(version)
  if (expectedCommit !== undefined && !/^[a-f0-9]{40}$/.test(expectedCommit)) {
    throw new Error("expected commit must be a full lowercase Git SHA")
  }
  const [manifestBytes, lockBytes, checksumBytes, imageLockBytes] = await Promise.all([
    readFile(resolve(manifestPath)),
    readFile(resolve(lockPath)),
    readFile(resolve(checksumPath)),
    imageLockPath === undefined ? Promise.resolve(undefined) : readFile(resolve(imageLockPath)),
  ])
  const manifest = parseReleaseManifest(JSON.parse(manifestBytes.toString("utf8")))
  if (!manifestBytes.equals(Buffer.from(serializeManifest(manifest)))) throw new Error("Release JSON manifest is not canonical")
  if (manifest.appliance.version !== expectedVersion) throw new Error("Release candidate version does not match the expected version")
  if (expectedCommit !== undefined && manifest.appliance.gitCommit !== expectedCommit) {
    throw new Error("Release candidate commit does not match the reviewed commit")
  }
  assertReleaseLockMatchesManifest(lockBytes, manifest)
  const lockSha256 = await sha256File(resolve(lockPath))
  const expectedChecksum = `${lockSha256}  ${basename(resolve(lockPath))}\n`
  if (!checksumBytes.equals(Buffer.from(expectedChecksum))) {
    throw new Error("Release lock SHA-256 sidecar is not canonical or does not match release.lock")
  }
  if (imageLockBytes !== undefined) {
    const lockedImages = validateImageLock(JSON.parse(imageLockBytes.toString("utf8")), expectedVersion)
    if (lockedImages.length !== manifest.images.length || lockedImages.some((image, index) => !sameImage(image, manifest.images[index]))) {
      throw new Error("Image lock does not exactly match the canonical release manifest")
    }
  }
  if (verifyArtifacts) {
    for (const artifact of [manifest.artifacts.deployment, manifest.artifacts.securityEvidence, ...manifest.artifacts.offlineImages]) {
      const path = resolve(artifactDirectory, artifact.file)
      const details = await stat(path)
      if (!details.isFile() || details.size !== artifact.bytes) throw new Error(`Artifact size mismatch: ${artifact.file}`)
      if (await sha256File(path) !== artifact.sha256) throw new Error(`Artifact checksum mismatch: ${artifact.file}`)
    }
  }
  return Object.freeze({ manifest, lockBytes, lockSha256 })
}

export function expectedReleaseAssetNames(manifestValue, phase) {
  const manifest = parseReleaseManifest(manifestValue)
  const version = manifest.appliance.version
  if (phase !== "candidate" && phase !== "final") throw new Error("asset phase must be candidate or final")
  const names = [
    `lospor-hospital-${version}-deployment.tar.gz`,
    ...manifest.artifacts.offlineImages.map(part => part.file),
    `lospor-hospital-${version}-manifest.json`,
    `lospor-hospital-${version}-release.lock`,
    `lospor-hospital-${version}-release.lock.sha256`,
    `lospor-hospital-${version}-security-evidence.tar.gz`,
  ]
  if (phase === "candidate") {
    names.push(
      `lospor-hospital-${version}-images.json`,
      `lospor-hospital-${version}-publication-request.tsv`,
    )
  }
  return names.sort()
}

export async function verifyReleaseAssetSet(directory, manifestValue, phase) {
  const expected = expectedReleaseAssetNames(manifestValue, phase)
  const actual = (await readdir(resolve(directory), { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort()
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error(`Release ${phase} asset set is incomplete or contains unexpected files`)
  }
  return true
}
