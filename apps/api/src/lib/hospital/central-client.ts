import { readFileSync } from "node:fs"
import { open } from "node:fs/promises"
import http from "node:http"
import https from "node:https"
import { URL } from "node:url"
import type {
  EncryptionEnvelope,
  ExchangeCapabilitiesV1,
  ExchangeManifestV1,
  ExchangeReceiptV1,
} from "@lospor/exchange-contract"
import { hospitalConfig } from "./config"
import { sha256 } from "./hash"

export class CentralApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message)
  }
}

type RequestOptions = {
  method?: string
  body?: Buffer | string
  headers?: Record<string, string>
  siteId?: string
  timeoutMs?: number
}

async function centralRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const config = hospitalConfig()
  const url = new URL(path, `${baseUrl.replace(/\/+$/, "")}/`)
  if (url.protocol !== "https:" &&
      !(config.HOSPITAL_CENTRAL_INSECURE_TEST === "true" && url.protocol === "http:")) {
    throw new Error("Central URL must use HTTPS")
  }
  const body = options.body
  const headers: Record<string, string> = {
    accept: "application/json",
    ...options.headers,
  }
  if (options.siteId) headers["x-lospor-site-id"] = options.siteId
  if (body != null) headers["content-length"] = String(Buffer.byteLength(body))

  const transport = url.protocol === "https:" ? https : http
  const response = await new Promise<{
    status: number
    contentType: string
    body: Buffer
  }>((resolve, reject) => {
    const request = transport.request(url, {
      method: options.method ?? "GET",
      headers,
      timeout: options.timeoutMs ?? 120_000,
      ...(url.protocol === "https:" ? {
        cert: readFileSync(config.HOSPITAL_MTLS_CERT_FILE),
        key: readFileSync(config.HOSPITAL_MTLS_KEY_FILE),
        ...(config.HOSPITAL_MTLS_CA_FILE
          ? { ca: readFileSync(config.HOSPITAL_MTLS_CA_FILE) }
          : {}),
      } : {}),
    }, incoming => {
      const chunks: Buffer[] = []
      incoming.on("data", chunk => chunks.push(Buffer.from(chunk)))
      incoming.on("end", () => resolve({
        status: incoming.statusCode ?? 500,
        contentType: String(incoming.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks),
      }))
    })
    request.once("timeout", () => request.destroy(new Error("Central request timed out")))
    request.once("error", reject)
    if (body != null) request.end(body)
    else request.end()
  })

  const parsed = response.body.length && response.contentType.includes("application/json")
    ? JSON.parse(response.body.toString("utf8")) as Record<string, unknown>
    : null
  if (response.status < 200 || response.status >= 300) {
    throw new CentralApiError(
      response.status,
      typeof parsed?.code === "string" ? parsed.code : "CENTRAL_REQUEST_FAILED",
      parsed?.retryable === true || response.status >= 500,
      typeof parsed?.error === "string" ? parsed.error : `Central returned ${response.status}`,
    )
  }
  return parsed as T
}

export function fetchCentralCapabilities(baseUrl: string) {
  return centralRequest<ExchangeCapabilitiesV1>(
    baseUrl,
    "/v1/exchange/capabilities",
  )
}

export function enrollCentralSite(baseUrl: string, body: {
  token: string
  siteCode: string
  siteName: string
  institutionSourceId: string
  mtlsFingerprintSha256: string
  signingKeyId: string
  signingPublicKeyPem: string
}) {
  return centralRequest<{
    site: {
      id: string
      code: string
      name: string
      nextExpectedSequence: number
    }
    capabilities: ExchangeCapabilitiesV1
  }>(baseUrl, "/v1/exchange/enroll", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

export async function uploadCentralBatch(input: {
  baseUrl: string
  siteId: string
  manifest: ExchangeManifestV1
  envelope: EncryptionEnvelope
  ciphertextPath: string
  chunkBytes: number
}): Promise<{ receipt: ExchangeReceiptV1 | null; status: string }> {
  const totalParts = Math.ceil(input.envelope.ciphertextByteSize / input.chunkBytes)
  await centralRequest(input.baseUrl, "/v1/exchange/batches", {
    method: "POST",
    siteId: input.siteId,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      manifest: input.manifest,
      envelope: input.envelope,
      totalParts,
    }),
  })

  const file = await open(input.ciphertextPath, "r")
  try {
    for (let part = 1; part <= totalParts; part += 1) {
      const offset = (part - 1) * input.chunkBytes
      const length = Math.min(
        input.chunkBytes,
        input.envelope.ciphertextByteSize - offset,
      )
      const buffer = Buffer.allocUnsafe(length)
      const read = await file.read(buffer, 0, length, offset)
      if (read.bytesRead !== length) throw new Error("Encrypted artifact ended unexpectedly")
      await centralRequest(
        input.baseUrl,
        `/v1/exchange/batches/${encodeURIComponent(input.manifest.batchId)}/parts/${part}`,
        {
          method: "PUT",
          siteId: input.siteId,
          body: buffer,
          headers: {
            "content-type": "application/octet-stream",
            "x-lospor-part-sha256": sha256(buffer),
          },
        },
      )
    }
  } finally {
    await file.close()
  }

  const completed = await centralRequest<{
    status: string
    receipt: ExchangeReceiptV1 | null
  }>(
    input.baseUrl,
    `/v1/exchange/batches/${encodeURIComponent(input.manifest.batchId)}/complete`,
    { method: "POST", siteId: input.siteId },
  )
  return completed
}

export function readCentralBatchStatus(
  baseUrl: string,
  siteId: string,
  batchId: string,
) {
  return centralRequest<{
    id: string
    sequence: number
    status: string
    receivedParts: number
    totalParts: number
    errors: unknown
    receipt: ExchangeReceiptV1 | null
    committedAt: string | null
  }>(
    baseUrl,
    `/v1/exchange/batches/${encodeURIComponent(batchId)}`,
    { siteId },
  )
}

