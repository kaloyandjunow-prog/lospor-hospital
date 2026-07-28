import { rm } from "node:fs/promises"
import {
  canonicalJson,
  type EncryptionEnvelope,
  type ExchangeManifestV1,
  type ExchangeReceiptV1,
} from "@lospor/exchange-contract"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  CentralApiError,
  readCentralBatchStatus,
  uploadCentralBatch,
} from "./central-client"
import { hospitalConfig } from "./config"
import { verifyCentralReceipt } from "./exchange-crypto"
import {
  generateCentralBatchArtifacts,
  reserveNextCentralBatch,
} from "./export-batch"
import { sha256 } from "./hash"

const LEASE_MS = 15 * 60 * 1000
const POLL_DELAY_MS = 15_000

type Claimed = { id: string }

async function claimBatch(workerId: string): Promise<string | null> {
  const expiresAt = new Date(Date.now() + LEASE_MS)
  const rows = await prisma.$queryRaw<Claimed[]>(Prisma.sql`
    WITH candidate AS (
      SELECT "id"
      FROM "CentralDeliveryBatch"
      WHERE
        "status" IN (
          'PENDING', 'GENERATING', 'READY', 'UPLOADING',
          'AWAITING_RECEIPT', 'RETRY'
        )
        AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
        AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < NOW())
      ORDER BY "sequence" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "CentralDeliveryBatch" AS batch
    SET
      "leaseOwner" = ${workerId},
      "leaseExpiresAt" = ${expiresAt},
      "attemptCount" = "attemptCount" + 1,
      "updatedAt" = NOW()
    FROM candidate
    WHERE batch."id" = candidate."id"
    RETURNING batch."id"
  `)
  return rows[0]?.id ?? null
}

function retryDelay(attempt: number): number {
  return Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(attempt, 8))
}

async function releaseForRetry(
  batchId: string,
  workerId: string,
  error: unknown,
): Promise<void> {
  const current = await prisma.centralDeliveryBatch.findUnique({
    where: { id: batchId },
    select: { attemptCount: true },
  })
  const code = error instanceof CentralApiError
    ? error.code
    : "HOSPITAL_DELIVERY_FAILED"
  const message = error instanceof Error
    ? error.message.slice(0, 500)
    : "Unknown delivery failure"
  await prisma.centralDeliveryBatch.updateMany({
    where: { id: batchId, leaseOwner: workerId },
    data: {
      status: "RETRY",
      nextAttemptAt: new Date(Date.now() + retryDelay(current?.attemptCount ?? 1)),
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: code,
      errorMessage: message,
    },
  })
}

async function acceptReceipt(
  batchId: string,
  workerId: string,
  receipt: ExchangeReceiptV1,
): Promise<void> {
  const batch = await prisma.centralDeliveryBatch.findUnique({
    where: { id: batchId },
    include: { cases: true },
  })
  const installation = await prisma.hospitalInstallation.findUnique({
    where: { id: "local" },
  })
  if (!batch?.manifest || !installation?.siteId ||
      !installation.receiptSigningKeyId ||
      !installation.receiptSigningPublicKeyPem) {
    throw new Error("Receipt verification state is incomplete")
  }
  const manifest = batch.manifest as unknown as ExchangeManifestV1
  if (!verifyCentralReceipt(receipt, {
    batchId: batch.id,
    siteId: installation.siteId,
    sequence: batch.sequence,
    payloadSha256: manifest.payloadSha256,
    signingKeyId: installation.receiptSigningKeyId,
    signingPublicKeyPem: installation.receiptSigningPublicKeyPem,
  })) {
    throw new Error("Central receipt signature or identity is invalid")
  }

  if (receipt.status === "REJECTED") {
    await prisma.centralDeliveryBatch.updateMany({
      where: { id: batch.id, leaseOwner: workerId },
      data: {
        status: "REJECTED",
        receipt: receipt as unknown as Prisma.InputJsonValue,
        receiptHash: sha256(canonicalJson(receipt)),
        errorCode: receipt.errors[0]?.code ?? "CENTRAL_REJECTED",
        errorMessage: receipt.errors[0]?.message ?? "Central rejected the batch",
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    })
    return
  }

  await prisma.$transaction(async tx => {
    const claimed = await tx.centralDeliveryBatch.updateMany({
      where: { id: batch.id, leaseOwner: workerId },
      data: {
        status: "ACCEPTED",
        receipt: receipt as unknown as Prisma.InputJsonValue,
        receiptHash: sha256(canonicalJson(receipt)),
        acceptedAt: receipt.committedAt ? new Date(receipt.committedAt) : new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        errorCode: null,
        errorMessage: null,
      },
    })
    if (claimed.count !== 1) return
    for (const item of batch.cases) {
      await tx.centralExportCheckpoint.upsert({
        where: { caseId: item.caseId },
        create: {
          caseId: item.caseId,
          lastBatchId: batch.id,
          lastAction: item.action,
          clinicalRevision: item.clinicalRevision,
          eventRevision: item.eventRevision,
          relationalRevision: item.relationalRevision,
          preopRevision: item.preopRevision,
          intraopRevision: item.intraopRevision,
          postopRevision: item.postopRevision,
          acceptedAt: receipt.committedAt ? new Date(receipt.committedAt) : new Date(),
        },
        update: {
          lastBatchId: batch.id,
          lastAction: item.action,
          clinicalRevision: item.clinicalRevision,
          eventRevision: item.eventRevision,
          relationalRevision: item.relationalRevision,
          preopRevision: item.preopRevision,
          intraopRevision: item.intraopRevision,
          postopRevision: item.postopRevision,
          acceptedAt: receipt.committedAt ? new Date(receipt.committedAt) : new Date(),
        },
      })
      if (item.action === "WITHDRAW") {
        await tx.caseCentralExportControl.updateMany({
          where: { caseId: item.caseId, decision: "WITHDRAW_REQUESTED" },
          data: { decision: "WITHDRAWN", updatedAt: new Date() },
        })
      }
    }
    await tx.hospitalInstallation.update({
      where: { id: "local" },
      data: {
        lastAcceptedBatchId: batch.id,
        lastDeliveryAt: receipt.committedAt ? new Date(receipt.committedAt) : new Date(),
      },
    })
  })
}

async function pollReceipt(
  batchId: string,
  workerId: string,
): Promise<boolean> {
  const [batch, installation] = await Promise.all([
    prisma.centralDeliveryBatch.findUnique({ where: { id: batchId } }),
    prisma.hospitalInstallation.findUnique({ where: { id: "local" } }),
  ])
  if (!batch || !installation?.siteId || !installation.centralBaseUrl) {
    throw new Error("Hospital delivery configuration is incomplete")
  }
  const status = await readCentralBatchStatus(
    installation.centralBaseUrl,
    installation.siteId,
    batch.id,
  )
  if (status.receipt) {
    await acceptReceipt(batch.id, workerId, status.receipt)
    return true
  }
  await prisma.centralDeliveryBatch.updateMany({
    where: { id: batch.id, leaseOwner: workerId },
    data: {
      status: "AWAITING_RECEIPT",
      nextAttemptAt: new Date(Date.now() + POLL_DELAY_MS),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  })
  return false
}

async function deliverBatch(batchId: string, workerId: string): Promise<void> {
  const [batch, installation] = await Promise.all([
    prisma.centralDeliveryBatch.findUnique({ where: { id: batchId } }),
    prisma.hospitalInstallation.findUnique({ where: { id: "local" } }),
  ])
  if (!batch?.manifest || !batch.envelope || !batch.ciphertextArtifactPath ||
      !installation?.siteId || !installation.centralBaseUrl ||
      !installation.multipartChunkBytes) {
    throw new Error("Generated batch is incomplete")
  }
  await prisma.centralDeliveryBatch.updateMany({
    where: { id: batch.id, leaseOwner: workerId },
    data: { status: "UPLOADING" },
  })
  const result = await uploadCentralBatch({
    baseUrl: installation.centralBaseUrl,
    siteId: installation.siteId,
    manifest: batch.manifest as unknown as ExchangeManifestV1,
    envelope: batch.envelope as unknown as EncryptionEnvelope,
    ciphertextPath: batch.ciphertextArtifactPath,
    chunkBytes: installation.multipartChunkBytes,
  })
  if (result.receipt) {
    await acceptReceipt(batch.id, workerId, result.receipt)
    return
  }
  await pollReceipt(batch.id, workerId)
}

export async function processOneCentralDelivery(
  workerId = crypto.randomUUID(),
): Promise<boolean> {
  await reserveNextCentralBatch()
  const batchId = await claimBatch(workerId)
  if (!batchId) return false
  try {
    const batch = await prisma.centralDeliveryBatch.findUnique({
      where: { id: batchId },
      select: { status: true },
    })
    if (!batch) return false
    if (batch.status === "PENDING" ||
        batch.status === "RETRY" ||
        batch.status === "GENERATING") {
      if (batch.status === "GENERATING") {
        await prisma.centralDeliveryBatch.update({
          where: { id: batchId },
          data: { status: "RETRY" },
        })
      }
      await generateCentralBatchArtifacts(batchId)
      await deliverBatch(batchId, workerId)
    } else if (batch.status === "READY" || batch.status === "UPLOADING") {
      await deliverBatch(batchId, workerId)
    } else if (batch.status === "AWAITING_RECEIPT") {
      await pollReceipt(batchId, workerId)
    }
  } catch (error) {
    console.error("[hospital-central-delivery]", batchId, error)
    await releaseForRetry(batchId, workerId, error)
  }
  return true
}

export async function processAvailableCentralDeliveries(limit = 5): Promise<number> {
  let processed = 0
  while (processed < limit && await processOneCentralDelivery()) processed += 1
  return processed
}

export async function cleanAcceptedArtifacts(): Promise<number> {
  const config = hospitalConfig()
  const cutoff = new Date(
    Date.now() - config.HOSPITAL_EXPORT_RETAIN_ACCEPTED_DAYS * 24 * 60 * 60 * 1000,
  )
  const batches = await prisma.centralDeliveryBatch.findMany({
    where: {
      status: "ACCEPTED",
      acceptedAt: { lt: cutoff },
      ciphertextArtifactPath: { not: null },
    },
    select: { id: true, ciphertextArtifactPath: true },
    take: 100,
  })
  for (const batch of batches) {
    if (batch.ciphertextArtifactPath) {
      await rm(batch.ciphertextArtifactPath, { force: true })
    }
    await prisma.centralDeliveryBatch.update({
      where: { id: batch.id },
      data: { ciphertextArtifactPath: null },
    })
  }
  return batches.length
}

