import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { materializeReleaseSignature } from "./materialize-release-signature.mjs"

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hospital-release-signature-"))
  const lockPath = join(directory, "lospor-hospital-1.2.0-release.lock")
  const publicKeyPath = join(directory, "release-signing-public.pem")
  const lock = Buffer.from("LOSPOR-HOSPITAL-RELEASE-LOCK-V2\nrelease\t1.2.0\n")
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const signature = sign(null, lock, privateKey)
  await Promise.all([
    writeFile(lockPath, lock),
    writeFile(publicKeyPath, publicKey.export({ type: "spki", format: "pem" })),
  ])
  return {
    directory,
    lock,
    lockPath,
    publicKeyPath,
    privateKey,
    signature,
    signatureBase64: signature.toString("base64"),
    expectedSignatureSha256: createHash("sha256").update(signature).digest("hex"),
  }
}

test("writes the exact verified raw Ed25519 signature beside the lock", async () => {
  const value = await fixture()
  const result = await materializeReleaseSignature(value)
  assert.equal(result.bytes, 64)
  assert.equal(result.signatureSha256, value.expectedSignatureSha256)
  assert.deepEqual(await readFile(`${value.lockPath}.sig`), value.signature)
})

test("rejects malformed, noncanonical, wrong-length and digest-mismatched input without writing", async () => {
  for (const mutate of [
    value => ({ ...value, signatureBase64: `${value.signatureBase64}\n` }),
    value => ({ ...value, signatureBase64: Buffer.alloc(63).toString("base64") }),
    value => ({ ...value, signatureBase64: "!".repeat(88) }),
    value => ({ ...value, expectedSignatureSha256: "0".repeat(64) }),
  ]) {
    const value = await fixture()
    await assert.rejects(materializeReleaseSignature(mutate(value)), /signature/i)
    await assert.rejects(readFile(`${value.lockPath}.sig`), /ENOENT/)
  }
})

test("rejects a forged signature, the wrong key, and a lock altered after signing", async () => {
  const forged = await fixture()
  const attacker = generateKeyPairSync("ed25519")
  forged.signature = sign(null, forged.lock, attacker.privateKey)
  forged.signatureBase64 = forged.signature.toString("base64")
  forged.expectedSignatureSha256 = createHash("sha256").update(forged.signature).digest("hex")
  await assert.rejects(materializeReleaseSignature(forged), /does not verify/)

  const wrongKey = await fixture()
  await writeFile(wrongKey.publicKeyPath, attacker.publicKey.export({ type: "spki", format: "pem" }))
  await assert.rejects(materializeReleaseSignature(wrongKey), /does not verify/)

  const altered = await fixture()
  await writeFile(altered.lockPath, Buffer.concat([altered.lock, Buffer.from("altered\n")]))
  await assert.rejects(materializeReleaseSignature(altered), /does not verify/)
})

test("rejects private material and non-Ed25519 public keys", async () => {
  const privateMaterial = await fixture()
  await writeFile(privateMaterial.publicKeyPath, privateMaterial.privateKey.export({ type: "pkcs8", format: "pem" }))
  await assert.rejects(materializeReleaseSignature(privateMaterial), /public key, never private/)

  const wrongAlgorithm = await fixture()
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
  await writeFile(wrongAlgorithm.publicKeyPath, rsa.publicKey.export({ type: "spki", format: "pem" }))
  await assert.rejects(materializeReleaseSignature(wrongAlgorithm), /must be Ed25519/)
})
