import { readFile, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  assertReleaseLockMatchesManifest,
  parseReleaseManifest,
  publicKeyFingerprint,
  serializeManifest,
  sha256File,
  verifyManifestSignature,
} from "./release-artifacts-lib.mjs"

const [manifestPath, lockPath, signaturePath, publicKeyPath, artifactDirectory = dirname(resolve(manifestPath ?? "."))] = process.argv.slice(2)
if (!manifestPath || !lockPath || !signaturePath || !publicKeyPath) {
  throw new Error("Usage: node scripts/verify-release-artifacts.mjs <manifest.json> <release.lock> <release.lock.sig> <trusted-public-key.pem> [artifact-directory]")
}
const [manifestBytes, lockBytes, signature, publicKey] = await Promise.all([
  readFile(manifestPath),
  readFile(lockPath),
  readFile(signaturePath, "utf8"),
  readFile(publicKeyPath, "utf8"),
])
if (!verifyManifestSignature(lockBytes, signature, publicKey)) throw new Error("Release-lock signature is invalid")
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
console.log(`Release ${manifest.appliance.version} JSON, lock, signature and artifacts verified with key sha256:${publicKeyFingerprint(publicKey)}`)
