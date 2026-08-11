import {
  constants,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  sign,
  verify,
} from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  EXCHANGE_SCHEMA,
  MANIFEST_VERSION,
  RECEIPT_SCHEMA,
  canonicalJson,
  signatureInput,
  type ExchangeManifestV1,
  type ExchangeReceiptV1,
} from "@lospor/exchange-contract"
import {
  encryptAndSignPayload,
  verifyCentralReceipt,
} from "./exchange-crypto"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(path =>
      rm(path, { recursive: true, force: true }),
    ),
  )
})

function manifest(payloadSha256: string): ExchangeManifestV1 {
  return {
    schema: EXCHANGE_SCHEMA,
    manifestVersion: MANIFEST_VERSION,
    batchId: "batch-1",
    sequence: 1,
    previousBatchId: null,
    generatedAt: "2026-07-28T10:00:00.000Z",
    cutoffFrom: null,
    cutoffTo: "2026-07-28T10:00:00.000Z",
    site: {
      siteId: "site-1",
      siteCode: "HOSP-A",
      institutionId: "institution-1",
    },
    versions: {
      // Arbitrary fixture values — this test encrypts and decrypts a manifest,
      // it does not care what the versions say. The real ones are asserted in
      // appliance-versions.test.ts.
      hospital: "1.0.0",
      api: "9.0.0",
      core: "9.0.0",
      omopSource: "5.4",
      databaseSchema: "1",
      conceptMap: "1",
      redactionProfile: "1",
      dataDictionary: "4.1.0",
    },
    qualityStatus: "PASS",
    cases: [],
    tables: [],
    exclusions: {
      policyExcluded: 0,
      caseExcluded: 0,
      qualityRejected: 0,
      withdrawn: 0,
    },
    payloadSha256,
  }
}

describe("Hospital/Central exchange cryptography", () => {
  it("encrypts, wraps and signs a payload that Central can authenticate", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lospor-exchange-"))
    temporaryDirectories.push(directory)
    const plaintextPath = join(directory, "payload.zip")
    const ciphertextPath = join(directory, "payload.enc")
    const signingKeyPath = join(directory, "site-signing.pem")
    const plaintext = Buffer.from("deterministic OMOP archive bytes")
    await writeFile(plaintextPath, plaintext)

    const centralKeys = generateKeyPairSync("rsa", {
      modulusLength: 3072,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    })
    const siteKeys = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    })
    await writeFile(signingKeyPath, siteKeys.privateKey, { mode: 0o600 })

    const exchangeManifest = manifest(
      "52cd6d4f0bc926f5b86131f98f6a99b651e70fb4a2270f498bc213ebd5bd8635",
    )
    const envelope = await encryptAndSignPayload({
      plaintextPath,
      ciphertextPath,
      manifest: exchangeManifest,
      centralEncryptionKeyId: "central-rsa-1",
      centralEncryptionPublicKeyPem: centralKeys.publicKey,
      siteSigningKeyId: "hospital-ed25519-1",
      siteSigningPrivateKeyFile: signingKeyPath,
    })

    const { signatureBase64, ...unsigned } = envelope
    expect(verify(
      null,
      Buffer.from(signatureInput(exchangeManifest, unsigned)),
      siteKeys.publicKey,
      Buffer.from(signatureBase64, "base64"),
    )).toBe(true)

    const payloadKey = privateDecrypt({
      key: centralKeys.privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    }, Buffer.from(envelope.wrappedKeyBase64, "base64"))
    const decipher = createDecipheriv(
      "aes-256-gcm",
      payloadKey,
      Buffer.from(envelope.ivBase64, "base64"),
    )
    decipher.setAuthTag(Buffer.from(envelope.authTagBase64, "base64"))
    const ciphertext = await readFile(ciphertextPath)
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    expect(decrypted).toEqual(plaintext)
  })

  it("accepts only a receipt signed for the exact batch revision", () => {
    const keys = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    })
    const unsigned = {
      schema: RECEIPT_SCHEMA,
      receiptId: "receipt-1",
      batchId: "batch-1",
      siteId: "site-1",
      sequence: 1,
      status: "ACCEPTED" as const,
      receivedAt: "2026-07-28T10:00:00.000Z",
      committedAt: "2026-07-28T10:00:01.000Z",
      payloadSha256: "payload-sha",
      acceptedCaseCount: 1,
      rejectedCaseCount: 0,
      tableRowCounts: { person: 1 },
      errors: [],
      centralVersion: "1.0.0",
      signingKeyId: "central-receipt-1",
    }
    const receipt: ExchangeReceiptV1 = {
      ...unsigned,
      signatureBase64: sign(
        null,
        Buffer.from(canonicalJson(unsigned)),
        keys.privateKey,
      ).toString("base64"),
    }
    const expected = {
      batchId: "batch-1",
      siteId: "site-1",
      sequence: 1,
      payloadSha256: "payload-sha",
      signingKeyId: "central-receipt-1",
      signingPublicKeyPem: keys.publicKey,
    }

    expect(verifyCentralReceipt(receipt, expected)).toBe(true)
    expect(verifyCentralReceipt(receipt, {
      ...expected,
      sequence: 2,
    })).toBe(false)
  })
})
