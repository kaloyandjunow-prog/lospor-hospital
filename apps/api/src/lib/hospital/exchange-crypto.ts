import {
  constants,
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  sign,
  verify,
} from "node:crypto"
import { createReadStream, createWriteStream, readFileSync } from "node:fs"
import { pipeline } from "node:stream/promises"
import {
  canonicalJson,
  signatureInput,
  type EncryptionEnvelope,
  type ExchangeManifestV1,
  type ExchangeReceiptV1,
} from "@lospor/exchange-contract"
import { sha256File } from "./hash"

export async function encryptAndSignPayload(input: {
  plaintextPath: string
  ciphertextPath: string
  manifest: ExchangeManifestV1
  centralEncryptionKeyId: string
  centralEncryptionPublicKeyPem: string
  siteSigningKeyId: string
  siteSigningPrivateKeyFile: string
}): Promise<EncryptionEnvelope> {
  const key = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  await pipeline(
    createReadStream(input.plaintextPath),
    cipher,
    createWriteStream(input.ciphertextPath, { flags: "wx", mode: 0o600 }),
  )
  const authTag = cipher.getAuthTag()
  const ciphertext = await sha256File(input.ciphertextPath)
  const unsigned = {
    algorithm: "AES-256-GCM" as const,
    keyWrapAlgorithm: "RSA-OAEP-256" as const,
    signatureAlgorithm: "Ed25519" as const,
    centralKeyId: input.centralEncryptionKeyId,
    siteSigningKeyId: input.siteSigningKeyId,
    wrappedKeyBase64: publicEncrypt({
      key: createPublicKey(input.centralEncryptionPublicKeyPem),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    }, key).toString("base64"),
    ivBase64: iv.toString("base64"),
    authTagBase64: authTag.toString("base64"),
    ciphertextSha256: ciphertext.sha256,
    ciphertextByteSize: ciphertext.byteSize,
  }
  const signatureBase64 = sign(
    null,
    Buffer.from(signatureInput(input.manifest, unsigned)),
    createPrivateKey(readFileSync(input.siteSigningPrivateKeyFile, "utf8")),
  ).toString("base64")
  return { ...unsigned, signatureBase64 }
}

export function verifyCentralReceipt(
  receipt: ExchangeReceiptV1,
  expected: {
    batchId: string
    siteId: string
    sequence: number
    payloadSha256: string
    signingKeyId: string
    signingPublicKeyPem: string
  },
): boolean {
  if (receipt.batchId !== expected.batchId ||
      receipt.siteId !== expected.siteId ||
      receipt.sequence !== expected.sequence ||
      receipt.payloadSha256 !== expected.payloadSha256 ||
      receipt.signingKeyId !== expected.signingKeyId) {
    return false
  }
  const { signatureBase64, ...unsigned } = receipt
  return verify(
    null,
    Buffer.from(canonicalJson(unsigned)),
    createPublicKey(expected.signingPublicKeyPem),
    Buffer.from(signatureBase64, "base64"),
  )
}

