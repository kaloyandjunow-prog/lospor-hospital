import {
  constants,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  sign,
  verify,
} from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { once } from "node:events"
import {
  CAPABILITIES_SCHEMA,
  RECEIPT_SCHEMA,
  canonicalJson,
  compareSequence,
  signatureInput,
  validateManifest,
  type EncryptionEnvelope,
  type ExchangeCapabilitiesV1,
  type ExchangeManifestV1,
  type ExchangeReceiptV1,
  type OmopTableName,
} from "@lospor/exchange-contract"
import { unzipSync } from "fflate"

export type SyntheticCentralFailureMode =
  | "none"
  | "invalid-receipt-signature"
  | "checkpoint-refusal"

type Upload = {
  manifest: ExchangeManifestV1
  envelope: EncryptionEnvelope
  totalParts: number
  parts: Map<number, Buffer>
  receipt: ExchangeReceiptV1 | null
}

export type SyntheticCentralObservation = {
  method: string
  route: string
  status: number
  batchId: string | null
  sequence: number | null
  caseActions: string[]
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

async function requestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const encoded = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(encoded.byteLength),
  })
  response.end(encoded)
}

function pemPair(type: "ed25519" | "rsa") {
  const pair = type === "ed25519"
    ? generateKeyPairSync("ed25519")
    : generateKeyPairSync("rsa", { modulusLength: 2048 })
  return {
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  }
}

/**
 * A deliberately small Central implementation for the Hospital release gate.
 * It is compiled only with tests and speaks the pinned pure exchange contract;
 * no Central repository or production fallback is imported.
 */
export async function startSyntheticCentral(input: {
  contractVersion: string
  siteId: string
  siteSigningPublicKeyPem: string
  expectedSequence: number
  expectedPreviousBatchId?: string | null
}) {
  const encryption = pemPair("rsa")
  const receipts = pemPair("ed25519")
  const uploads = new Map<string, Upload>()
  const observations: SyntheticCentralObservation[] = []
  const inspectedArchiveText: string[] = []
  let expectedSequence = input.expectedSequence
  let expectedPreviousBatchId = input.expectedPreviousBatchId ?? null
  let failureMode: SyntheticCentralFailureMode = "none"

  const capabilities: ExchangeCapabilitiesV1 = {
    schema: CAPABILITIES_SCHEMA,
    centralVersion: input.contractVersion,
    supportedManifestVersions: [1],
    minimumHospitalVersion: null,
    maximumUploadBytes: 16 * 1024 * 1024,
    multipartChunkBytes: 1024,
    acceptedOmopVersions: ["5.4"],
    centralEncryptionKeyId: `synthetic-rsa-${input.contractVersion}`,
    centralEncryptionPublicKeyPem: encryption.publicKeyPem,
    receiptSigningKeyId: `synthetic-ed25519-${input.contractVersion}`,
    receiptSigningPublicKeyPem: receipts.publicKeyPem,
  }

  function observe(
    request: IncomingMessage,
    status: number,
    batch: Upload | null = null,
  ): void {
    observations.push({
      method: request.method ?? "UNKNOWN",
      route: new URL(request.url ?? "/", "http://fixture.invalid").pathname
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":batchId"),
      status,
      batchId: batch?.manifest.batchId ?? null,
      sequence: batch?.manifest.sequence ?? null,
      caseActions: batch?.manifest.cases.map(item => item.action) ?? [],
    })
  }

  function signedReceipt(
    upload: Upload,
    status: "ACCEPTED" | "REJECTED",
    errors: ExchangeReceiptV1["errors"] = [],
  ): ExchangeReceiptV1 {
    const committedAt = status === "ACCEPTED" ? new Date().toISOString() : null
    const unsigned: Omit<ExchangeReceiptV1, "signatureBase64"> = {
      schema: RECEIPT_SCHEMA,
      receiptId: `synthetic-receipt-${upload.manifest.sequence}`,
      batchId: upload.manifest.batchId,
      siteId: input.siteId,
      sequence: upload.manifest.sequence,
      status,
      receivedAt: new Date().toISOString(),
      committedAt,
      payloadSha256: upload.manifest.payloadSha256,
      acceptedCaseCount: status === "ACCEPTED" ? upload.manifest.cases.length : 0,
      rejectedCaseCount: status === "REJECTED" ? upload.manifest.cases.length : 0,
      tableRowCounts: Object.fromEntries(
        upload.manifest.tables.map(table => [table.table, table.rowCount]),
      ) as Partial<Record<OmopTableName, number>>,
      errors,
      centralVersion: input.contractVersion,
      signingKeyId: capabilities.receiptSigningKeyId,
    }
    const signatureBase64 = sign(
      null,
      Buffer.from(canonicalJson(unsigned)),
      createPrivateKey(receipts.privateKeyPem),
    ).toString("base64")
    return { ...unsigned, signatureBase64 }
  }

  function inspectUpload(upload: Upload): void {
    const ciphertext = Buffer.concat(
      [...upload.parts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, part]) => part),
    )
    if (ciphertext.byteLength !== upload.envelope.ciphertextByteSize ||
        sha256(ciphertext) !== upload.envelope.ciphertextSha256) {
      throw new Error("CIPHERTEXT_INTEGRITY_FAILED")
    }
    const { signatureBase64, ...unsignedEnvelope } = upload.envelope
    if (!verify(
      null,
      Buffer.from(signatureInput(upload.manifest, unsignedEnvelope)),
      createPublicKey(input.siteSigningPublicKeyPem),
      Buffer.from(signatureBase64, "base64"),
    )) {
      throw new Error("HOSPITAL_SIGNATURE_INVALID")
    }
    const key = privateDecrypt({
      key: createPrivateKey(encryption.privateKeyPem),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    }, Buffer.from(upload.envelope.wrappedKeyBase64, "base64"))
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(upload.envelope.ivBase64, "base64"),
    )
    decipher.setAuthTag(Buffer.from(upload.envelope.authTagBase64, "base64"))
    const archive = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    if (sha256(archive) !== upload.manifest.payloadSha256) {
      throw new Error("PAYLOAD_INTEGRITY_FAILED")
    }
    const entries = unzipSync(archive)
    for (const table of upload.manifest.tables) {
      const file = entries[table.filename]
      if (!file || file.byteLength !== table.byteSize || sha256(Buffer.from(file)) !== table.sha256) {
        throw new Error("TABLE_INTEGRITY_FAILED")
      }
      inspectedArchiveText.push(Buffer.from(file).toString("utf8"))
    }
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://fixture.invalid")
      if (request.method === "GET" && url.pathname === "/v1/exchange/capabilities") {
        observe(request, 200)
        json(response, 200, capabilities)
        return
      }
      if (request.headers["x-lospor-site-id"] !== input.siteId) {
        observe(request, 401)
        json(response, 401, { code: "SITE_ID_INVALID", retryable: false, error: "Site identity is invalid" })
        return
      }
      if (request.method === "POST" && url.pathname === "/v1/exchange/batches") {
        const parsed = JSON.parse((await requestBody(request)).toString("utf8")) as {
          manifest?: unknown
          envelope?: EncryptionEnvelope
          totalParts?: number
        }
        const validation = validateManifest(parsed.manifest)
        if (!validation.ok || !parsed.envelope || !Number.isSafeInteger(parsed.totalParts) ||
            Number(parsed.totalParts) < 1) {
          observe(request, 400)
          json(response, 400, { code: "MANIFEST_INVALID", retryable: false, error: "Manifest is invalid" })
          return
        }
        const manifest = validation.manifest
        const sequenceState = compareSequence(expectedSequence, manifest.sequence)
        if (failureMode === "checkpoint-refusal" || sequenceState !== "EXPECTED" ||
            manifest.previousBatchId !== expectedPreviousBatchId) {
          observe(request, 409, { manifest, envelope: parsed.envelope, totalParts: Number(parsed.totalParts), parts: new Map(), receipt: null })
          json(response, 409, {
            code: "CHECKPOINT_MISMATCH",
            retryable: false,
            error: "Batch checkpoint does not match the accepted sequence",
          })
          return
        }
        const upload: Upload = {
          manifest,
          envelope: parsed.envelope,
          totalParts: Number(parsed.totalParts),
          parts: new Map(),
          receipt: null,
        }
        uploads.set(manifest.batchId, upload)
        observe(request, 201, upload)
        json(response, 201, { id: manifest.batchId, status: "RECEIVING" })
        return
      }
      const partMatch = /^\/v1\/exchange\/batches\/([^/]+)\/parts\/(\d+)$/.exec(url.pathname)
      if (request.method === "PUT" && partMatch) {
        const upload = uploads.get(decodeURIComponent(partMatch[1]!))
        const part = Number(partMatch[2])
        const body = await requestBody(request)
        if (!upload || part < 1 || part > upload.totalParts ||
            request.headers["x-lospor-part-sha256"] !== sha256(body)) {
          observe(request, 400, upload ?? null)
          json(response, 400, { code: "PART_INVALID", retryable: false, error: "Upload part is invalid" })
          return
        }
        upload.parts.set(part, body)
        observe(request, 204, upload)
        response.writeHead(204).end()
        return
      }
      const completeMatch = /^\/v1\/exchange\/batches\/([^/]+)\/complete$/.exec(url.pathname)
      if (request.method === "POST" && completeMatch) {
        const upload = uploads.get(decodeURIComponent(completeMatch[1]!))
        if (!upload || upload.parts.size !== upload.totalParts) {
          observe(request, 409, upload ?? null)
          json(response, 409, { code: "UPLOAD_INCOMPLETE", retryable: true, error: "Upload is incomplete" })
          return
        }
        inspectUpload(upload)
        const validReceipt = signedReceipt(upload, "ACCEPTED")
        upload.receipt = failureMode === "invalid-receipt-signature"
          ? { ...validReceipt, signatureBase64: Buffer.alloc(64, 0).toString("base64") }
          : validReceipt
        if (failureMode !== "invalid-receipt-signature") {
          expectedSequence += 1
          expectedPreviousBatchId = upload.manifest.batchId
        }
        observe(request, 200, upload)
        json(response, 200, { status: "COMMITTED", receipt: upload.receipt })
        return
      }
      const statusMatch = /^\/v1\/exchange\/batches\/([^/]+)$/.exec(url.pathname)
      if (request.method === "GET" && statusMatch) {
        const upload = uploads.get(decodeURIComponent(statusMatch[1]!))
        if (!upload) {
          observe(request, 404)
          json(response, 404, { code: "BATCH_NOT_FOUND", retryable: false, error: "Batch was not found" })
          return
        }
        observe(request, 200, upload)
        json(response, 200, {
          id: upload.manifest.batchId,
          sequence: upload.manifest.sequence,
          status: upload.receipt ? "COMMITTED" : "RECEIVING",
          receivedParts: upload.parts.size,
          totalParts: upload.totalParts,
          errors: null,
          receipt: upload.receipt,
          committedAt: upload.receipt?.committedAt ?? null,
        })
        return
      }
      observe(request, 404)
      json(response, 404, { code: "NOT_FOUND", retryable: false, error: "Route was not found" })
    } catch {
      observe(request, 422)
      json(response, 422, { code: "CONTRACT_REFUSED", retryable: false, error: "Exchange contract validation failed" })
    }
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Synthetic Central did not bind a TCP port")

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    capabilities,
    observations,
    inspectedArchiveText,
    setFailureMode(mode: SyntheticCentralFailureMode) {
      failureMode = mode
    },
    checkpoint() {
      return { expectedSequence, expectedPreviousBatchId }
    },
    async close() {
      server.close()
      await once(server, "close")
    },
  }
}
