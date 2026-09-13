import { createHash, createPublicKey, verify } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const ED25519_SIGNATURE_BASE64 = /^(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/]{2}==$/
const SHA256 = /^[a-f0-9]{64}$/

/**
 * The SHA-256 of a signature given as canonical base64, refusing anything that
 * is not exactly one 64-byte Ed25519 signature. Publication derives the digest
 * from the signature itself rather than asking a person to type it.
 */
export function releaseSignatureDigest(signatureBase64) {
  if (typeof signatureBase64 !== "string" || !ED25519_SIGNATURE_BASE64.test(signatureBase64)) {
    throw new Error("Release signature must be canonical base64 for exactly one 64-byte Ed25519 signature")
  }
  const signature = Buffer.from(signatureBase64, "base64")
  if (signature.length !== 64 || signature.toString("base64") !== signatureBase64) {
    throw new Error("Release signature base64 is not canonical or does not decode to exactly 64 bytes")
  }
  return createHash("sha256").update(signature).digest("hex")
}

export async function materializeReleaseSignature({
  lockPath,
  signatureBase64,
  expectedSignatureSha256,
  publicKeyPath,
}) {
  if (typeof signatureBase64 !== "string" || !ED25519_SIGNATURE_BASE64.test(signatureBase64)) {
    throw new Error("Release signature must be canonical base64 for exactly one 64-byte Ed25519 signature")
  }
  if (typeof expectedSignatureSha256 !== "string" || !SHA256.test(expectedSignatureSha256)) {
    throw new Error("Expected release-signature SHA-256 must be 64 lowercase hexadecimal characters")
  }

  const signature = Buffer.from(signatureBase64, "base64")
  if (signature.length !== 64 || signature.toString("base64") !== signatureBase64) {
    throw new Error("Release signature base64 is not canonical or does not decode to exactly 64 bytes")
  }
  const actualSignatureSha256 = createHash("sha256").update(signature).digest("hex")
  if (actualSignatureSha256 !== expectedSignatureSha256) {
    throw new Error("Release signature does not match the independently reviewed SHA-256")
  }

  const [lock, publicKeyBytes] = await Promise.all([
    readFile(resolve(lockPath)),
    readFile(resolve(publicKeyPath)),
  ])
  if (lock.length === 0) throw new Error("Release lock is missing or empty")
  if (publicKeyBytes.includes(Buffer.from("PRIVATE KEY"))) {
    throw new Error("Release verification requires a public key, never private key material")
  }
  const publicKey = createPublicKey(publicKeyBytes)
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Release verification key must be Ed25519")
  }
  if (!verify(null, lock, publicKey, signature)) {
    throw new Error("Release signature does not verify over the exact release lock")
  }

  const signaturePath = `${resolve(lockPath)}.sig`
  await writeFile(signaturePath, signature, { flag: "wx", mode: 0o444 })
  return Object.freeze({ signaturePath, signatureSha256: actualSignatureSha256, bytes: signature.length })
}

async function main() {
  if (process.argv[2] === "--digest") {
    if (process.argv.length !== 4) throw new Error("Usage: node scripts/materialize-release-signature.mjs --digest <canonical-base64-signature>")
    process.stdout.write(`${releaseSignatureDigest(process.argv[3])}\n`)
    return
  }
  const [lockPath, signatureBase64, expectedSignatureSha256, publicKeyPath, ...extra] = process.argv.slice(2)
  if (!lockPath || !signatureBase64 || !expectedSignatureSha256 || !publicKeyPath || extra.length > 0) {
    throw new Error("Usage: node scripts/materialize-release-signature.mjs <release.lock> <canonical-base64-signature> <signature-sha256> <public-key.pem>")
  }
  const result = await materializeReleaseSignature({ lockPath, signatureBase64, expectedSignatureSha256, publicKeyPath })
  console.log(`Release signature verified and written (${result.bytes} bytes, sha256:${result.signatureSha256})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
