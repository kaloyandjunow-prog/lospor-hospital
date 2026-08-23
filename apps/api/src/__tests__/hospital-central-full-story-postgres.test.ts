import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { config as loadDotenv } from "dotenv"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { startSyntheticCentral } from "./fixtures/synthetic-central"

// The integration uses the real server-only Prisma and worker modules from a
// Node test process. This removes only Next's import sentinel, not any Hospital
// authorization, persistence, crypto or delivery behavior.
vi.mock("server-only", () => ({}))

const runFullStory = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"
  && process.env.LOSPOR_CENTRAL_FULL_STORY === "true"
if (runFullStory && !process.env.DATABASE_URL && !process.env.DIRECT_URL) {
  loadDotenv({ quiet: true })
}

type PrismaModule = typeof import("@/lib/prisma")
type WorkerModule = typeof import("@/lib/hospital/delivery-worker")
type ProjectionModule = typeof import("@/lib/hospital/case-central-export")

type SyntheticCase = {
  id: string
  patientLinkId: string
}

const supportUrl = new URL("../../../../scripts/exchange-contract-support.json", import.meta.url)
const PII_SENTINEL = "9001019999-PRIVATE-SYNTHETIC"

describe.skipIf(!runFullStory).sequential(
  "Hospital to synthetic Central release full story",
  () => {
    let prisma: PrismaModule["prisma"]
    let processOneCentralDelivery: WorkerModule["processOneCentralDelivery"]
    let readCaseCentralExport: ProjectionModule["readCaseCentralExport"]
    let temporaryDirectory = ""
    let sitePublicKeyPem = ""
    const institutionIds: string[] = []
    const userIds: string[] = []
    const caseIds: string[] = []
    const patientLinkIds: string[] = []
    const batchIds: string[] = []
    const usernameReservationIds: string[] = []

    beforeAll(async () => {
      if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
        throw new Error(
          "Hospital-to-Central full-story gate requires DATABASE_URL or DIRECT_URL for a disposable migrated PostgreSQL database",
        )
      }
      temporaryDirectory = await mkdtemp(join(tmpdir(), "lospor-central-full-story-"))
      const siteKeys = generateKeyPairSync("ed25519")
      const sitePrivateKeyPem = siteKeys.privateKey
        .export({ type: "pkcs8", format: "pem" }).toString()
      sitePublicKeyPem = siteKeys.publicKey
        .export({ type: "spki", format: "pem" }).toString()
      const privateKeyFile = join(temporaryDirectory, "site-signing-private.pem")
      const publicKeyFile = join(temporaryDirectory, "site-signing-public.pem")
      await Promise.all([
        writeFile(privateKeyFile, sitePrivateKeyPem, { mode: 0o600 }),
        writeFile(publicKeyFile, sitePublicKeyPem, { mode: 0o600 }),
      ])
      process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
      process.env.HOSPITAL_CENTRAL_INSECURE_TEST = "true"
      process.env.HOSPITAL_EXPORT_DIR = join(temporaryDirectory, "artifacts")
      process.env.HOSPITAL_SITE_SIGNING_PRIVATE_KEY_FILE = privateKeyFile
      process.env.HOSPITAL_SITE_SIGNING_PUBLIC_KEY_FILE = publicKeyFile
      process.env.HOSPITAL_SITE_SIGNING_KEY_ID = "synthetic-hospital-ed25519"
      process.env.HOSPITAL_WORKER_TOKEN = randomBytes(32).toString("hex")
      process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY = randomBytes(32).toString("base64")
      process.env.OMOP_PSEUDONYM_SALT = randomBytes(32).toString("hex")

      const configModule = await import("@/lib/hospital/config")
      configModule.resetHospitalConfigForTests()
      ;({ prisma } = await import("@/lib/prisma"))
      ;({ processOneCentralDelivery } = await import("@/lib/hospital/delivery-worker"))
      ;({ readCaseCentralExport } = await import("@/lib/hospital/case-central-export"))

      const [installation, activeBatch] = await Promise.all([
        prisma.hospitalInstallation.findUnique({ where: { id: "local" }, select: { id: true } }),
        prisma.centralDeliveryBatch.findFirst({
          where: { status: { in: ["PENDING", "GENERATING", "READY", "UPLOADING", "AWAITING_RECEIPT", "RETRY"] } },
          select: { id: true },
        }),
      ])
      if (installation || activeBatch) {
        throw new Error(
          "The Central full-story gate requires the disposable migrated release database",
        )
      }
    })

    afterAll(async () => {
      if (prisma) {
        await prisma.hospitalInstallation.deleteMany({ where: { id: "local" } }).catch(() => undefined)
        await prisma.centralDeliveryBatch.deleteMany({ where: { id: { in: batchIds } } }).catch(() => undefined)
        await prisma.case.deleteMany({ where: { id: { in: caseIds } } }).catch(() => undefined)
        await prisma.patientLink.deleteMany({ where: { id: { in: patientLinkIds } } }).catch(() => undefined)
        await prisma.centralExportPolicy.deleteMany({ where: { institutionId: { in: institutionIds } } }).catch(() => undefined)
        await prisma.hospitalUsernameReservation.deleteMany({
          where: { id: { in: usernameReservationIds } },
        }).catch(() => undefined)
        await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined)
        await prisma.institution.deleteMany({ where: { id: { in: institutionIds } } }).catch(() => undefined)
        await prisma.$disconnect()
      }
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
    })

    async function nextSequence(): Promise<number> {
      const aggregate = await prisma.centralDeliveryBatch.aggregate({ _max: { sequence: true } })
      return (aggregate._max.sequence ?? 0) + 1
    }

    async function createSite(label: string) {
      const suffix = randomUUID()
      const institutionId = `central-story-institution-${label}-${suffix}`
      const userId = `central-story-admin-${label}-${suffix}`
      const username = `Central-${label}-${suffix}`
      const usernameCanonical = username.toLowerCase()
      const usernameReservationId = `central-story-username-${label}-${suffix}`
      institutionIds.push(institutionId)
      userIds.push(userId)
      usernameReservationIds.push(usernameReservationId)
      await prisma.institution.create({
        data: { id: institutionId, name: `Synthetic Hospital ${label}`, city: "Sofia" },
      })
      await prisma.user.create({
        data: {
          id: userId,
          email: `central-story-${label}-${suffix}@example.invalid`,
          username,
          usernameCanonical,
          name: `Synthetic Operator ${label}`,
          passwordHash: "not-a-real-password-hash",
          role: "ADMIN",
          institutionId,
          approvedAt: new Date(),
          activatedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.hospitalUsernameReservation.create({
        data: {
          id: usernameReservationId,
          usernameCanonical,
          userId,
        },
      })
      await prisma.centralExportPolicy.create({
        data: {
          institutionId,
          enabled: false,
          approvedById: null,
          approvedAt: null,
          includeRedactedText: false,
          redactionProfile: "bg-en-v1",
        },
      })
      return { institutionId, userId, suffix }
    }

    async function createCompleteCase(input: {
      institutionId: string
      userId: string
      label: string
    }): Promise<SyntheticCase> {
      const id = `central-story-case-${input.label}-${randomUUID()}`
      const patientLinkId = `central-story-patient-${input.label}-${randomUUID()}`
      const finalizedAt = new Date(Date.now() - 24 * 60 * 60 * 1000)
      caseIds.push(id)
      patientLinkIds.push(patientLinkId)
      await prisma.patientLink.create({
        data: {
          id: patientLinkId,
          institutionId: input.institutionId,
          identifierHash: randomBytes(32).toString("hex"),
          // Deliberately obvious local-only values. If an identity join leaks,
          // the assertions below catch it in the wire, UI, log or artifact.
          identifierCiphertext: PII_SENTINEL,
          identifierNonce: "synthetic-local-nonce",
          identifierAuthTag: "synthetic-local-auth-tag",
          maskedIdentifier: PII_SENTINEL,
          createdById: input.userId,
        },
      })
      await prisma.case.create({
        data: {
          id,
          caseCode: `SYNTHETIC-${input.label}`,
          notes: `local identity note ${PII_SENTINEL}`,
          userId: input.userId,
          createdById: input.userId,
          institutionId: input.institutionId,
          patientLinkId,
          status: "DRAFT",
          clinicalMode: "ADULT",
          createdAt: finalizedAt,
          updatedAt: finalizedAt,
          preop: {
            create: {
              ageYears: 42,
              sex: "FEMALE",
              diagnosis: "Synthetic diagnosis",
              plannedProcedure: "Synthetic procedure",
              createdAt: finalizedAt,
              updatedAt: finalizedAt,
            },
          },
          fieldStatuses: {
            create: {
              section: "preop",
              fieldKey: "diagnosis",
              presence: "PRESENT",
              source: "central-full-story",
              createdAt: finalizedAt,
              updatedAt: finalizedAt,
            },
          },
          finalizations: {
            create: {
              sequence: 1,
              schemaVersion: "synthetic-full-story/v1",
              snapshotDocument: "{}",
              snapshotHash: "a".repeat(64),
              finalizedAt,
              finalizedById: input.userId,
            },
          },
        },
      })
      // Seed the same durable shape the finalization transaction leaves. Child
      // records must exist while the parent is editable because PostgreSQL
      // correctly rejects clinical child writes after status becomes COMPLETE.
      await prisma.case.update({
        where: { id },
        data: { status: "COMPLETE", finalizedAt },
      })
      // The parent revision trigger stamps the real current time. This test
      // needs an already-closed undo window; adjusting metadata alone is safe
      // and avoids weakening the production eligibility rule or its clock.
      await prisma.case.update({ where: { id }, data: { updatedAt: finalizedAt } })
      return { id, patientLinkId }
    }

    async function configureInstallation(input: {
      institutionId: string
      userId: string
      siteId: string
      siteCode: string
      baseUrl: string
      sequence: number
      capabilities: Awaited<ReturnType<typeof startSyntheticCentral>>["capabilities"]
    }) {
      await prisma.hospitalInstallation.upsert({
        where: { id: "local" },
        create: {
          id: "local",
          siteId: input.siteId,
          siteCode: input.siteCode,
          institutionId: input.institutionId,
          centralBaseUrl: input.baseUrl,
          centralEnabled: true,
          signingKeyId: "synthetic-hospital-ed25519",
          centralEncryptionKeyId: input.capabilities.centralEncryptionKeyId,
          centralEncryptionPublicKeyPem: input.capabilities.centralEncryptionPublicKeyPem,
          receiptSigningKeyId: input.capabilities.receiptSigningKeyId,
          receiptSigningPublicKeyPem: input.capabilities.receiptSigningPublicKeyPem,
          supportedManifestVersions: input.capabilities.supportedManifestVersions,
          maximumUploadBytes: input.capabilities.maximumUploadBytes,
          multipartChunkBytes: input.capabilities.multipartChunkBytes,
          nextSequence: input.sequence,
          transportConfigurationHash: "b".repeat(64),
          transportConfiguredAt: new Date(),
          transportConfiguredById: input.userId,
          transportConfigurationReason: "Synthetic full-story release validation",
        },
        update: {
          siteId: input.siteId,
          siteCode: input.siteCode,
          institutionId: input.institutionId,
          centralBaseUrl: input.baseUrl,
          centralEnabled: true,
          signingKeyId: "synthetic-hospital-ed25519",
          centralEncryptionKeyId: input.capabilities.centralEncryptionKeyId,
          centralEncryptionPublicKeyPem: input.capabilities.centralEncryptionPublicKeyPem,
          receiptSigningKeyId: input.capabilities.receiptSigningKeyId,
          receiptSigningPublicKeyPem: input.capabilities.receiptSigningPublicKeyPem,
          supportedManifestVersions: input.capabilities.supportedManifestVersions,
          maximumUploadBytes: input.capabilities.maximumUploadBytes,
          multipartChunkBytes: input.capabilities.multipartChunkBytes,
          nextSequence: input.sequence,
          lastAcceptedBatchId: null,
          lastDeliveryAt: null,
          transportConfigurationHash: "b".repeat(64),
          transportConfiguredAt: new Date(),
          transportConfiguredById: input.userId,
          transportConfigurationReason: "Synthetic full-story release validation",
        },
      })
    }

    async function trackLatestBatch(caseId: string) {
      const item = await prisma.centralDeliveryCase.findFirst({
        where: { caseId },
        orderBy: { batch: { sequence: "desc" } },
        include: { batch: true },
      })
      expect(item).not.toBeNull()
      batchIds.push(item!.batchId)
      return item!
    }

    async function exercisePositiveVersion(contractVersion: string) {
      const site = await createSite(contractVersion.replaceAll(".", "-"))
      const sequence = await nextSequence()
      const siteId = `synthetic-site-${site.suffix}`
      const central = await startSyntheticCentral({
        contractVersion,
        siteId,
        siteSigningPublicKeyPem: sitePublicKeyPem,
        expectedSequence: sequence,
      })
      try {
        await configureInstallation({
          ...site,
          siteId,
          siteCode: `SYN-${contractVersion}`,
          baseUrl: central.baseUrl,
          sequence,
          capabilities: central.capabilities,
        })
        const first = await createCompleteCase({ ...site, label: `${contractVersion}-first` })
        const second = await createCompleteCase({ ...site, label: `${contractVersion}-second` })

        // Configuration alone is insufficient. Institution approval is a
        // separate durable gate, and no network request may occur before it.
        await expect(processOneCentralDelivery(`worker-${contractVersion}-blocked`)).resolves.toBe(false)
        expect(central.observations).toHaveLength(0)
        await prisma.centralExportPolicy.update({
          where: { institutionId: site.institutionId },
          data: { enabled: true, approvedById: site.userId, approvedAt: new Date() },
        })

        await expect(processOneCentralDelivery(`worker-${contractVersion}-upsert`)).resolves.toBe(true)
        const upsert = await trackLatestBatch(first.id)
        const secondUpsert = await trackLatestBatch(second.id)
        expect(upsert.action).toBe("UPSERT")
        expect(secondUpsert.action).toBe("UPSERT")
        expect(secondUpsert.batchId).toBe(upsert.batchId)
        expect(upsert.batch.status).toBe("ACCEPTED")
        expect(upsert.batch.receiptHash).toMatch(/^[a-f0-9]{64}$/)
        expect(upsert.batch.manifest).toMatchObject({
          sequence,
          previousBatchId: null,
          exclusions: { caseExcluded: 0 },
        })
        expect(await prisma.centralExportCheckpoint.findUnique({ where: { caseId: first.id } }))
          .toMatchObject({ lastAction: "UPSERT", lastBatchId: upsert.batchId })
        await expect(readCaseCentralExport(prisma, { id: first.id }))
          .resolves.toMatchObject({ state: "ACCEPTED", canWithdraw: true, canResend: false })
        await expect(readCaseCentralExport(prisma, { id: second.id }))
          .resolves.toMatchObject({ state: "ACCEPTED", canWithdraw: true, canResend: false })

        const artifactPath = upsert.batch.ciphertextArtifactPath
        expect(artifactPath).toBeTruthy()
        expect(await readdir(dirname(artifactPath!))).toEqual(["payload.enc"])
        expect((await readFile(artifactPath!)).toString("utf8")).not.toContain(PII_SENTINEL)

        await prisma.caseCentralExportControl.upsert({
          where: { caseId: first.id },
          create: {
            caseId: first.id,
            decision: "WITHDRAW_REQUESTED",
            reasonCode: "CLINICIAN_WITHDRAWAL",
            reasonNote: null,
            decidedById: site.userId,
            decidedAt: new Date(),
          },
          update: {
            decision: "WITHDRAW_REQUESTED",
            reasonCode: "CLINICIAN_WITHDRAWAL",
            decidedById: site.userId,
            decidedAt: new Date(),
          },
        })
        await expect(processOneCentralDelivery(`worker-${contractVersion}-withdraw`)).resolves.toBe(true)
        const withdrawal = await trackLatestBatch(first.id)
        expect(withdrawal.action).toBe("WITHDRAW")
        expect(withdrawal.batch.status).toBe("ACCEPTED")
        expect(withdrawal.batch.previousBatchId).toBe(upsert.batchId)
        expect(await prisma.centralExportCheckpoint.findUnique({ where: { caseId: first.id } }))
          .toMatchObject({ lastAction: "WITHDRAW", lastBatchId: withdrawal.batchId })
        expect(await prisma.caseCentralExportControl.findUnique({ where: { caseId: first.id } }))
          .toMatchObject({ decision: "WITHDRAWN" })
        const withdrawnUi = await readCaseCentralExport(prisma, { id: first.id })
        expect(withdrawnUi).toMatchObject({ state: "WITHDRAWN", canWithdraw: false, canResend: true })

        await prisma.caseCentralExportControl.update({
          where: { caseId: first.id },
          data: {
            decision: "DEFAULT",
            reasonCode: "CLINICIAN_RESEND",
            decidedAt: new Date(),
          },
        })
        await expect(processOneCentralDelivery(`worker-${contractVersion}-resend`)).resolves.toBe(true)
        const resend = await trackLatestBatch(first.id)
        expect(resend.action).toBe("UPSERT")
        expect(resend.batch.status).toBe("ACCEPTED")
        expect(resend.batch.previousBatchId).toBe(withdrawal.batchId)
        expect(await prisma.centralExportCheckpoint.findUnique({ where: { caseId: first.id } }))
          .toMatchObject({ lastAction: "UPSERT", lastBatchId: resend.batchId })
        const resentUi = await readCaseCentralExport(prisma, { id: first.id })
        expect(resentUi).toMatchObject({ state: "ACCEPTED", canWithdraw: true, canResend: false })

        const safeSurfaces = JSON.stringify({
          observations: central.observations,
          archive: central.inspectedArchiveText,
          acceptedUi: await readCaseCentralExport(prisma, { id: second.id }),
          withdrawnUi,
          resentUi,
          manifests: [upsert.batch.manifest, withdrawal.batch.manifest, resend.batch.manifest],
          errors: [upsert.batch.errorCode, withdrawal.batch.errorCode, resend.batch.errorCode],
        })
        expect(safeSurfaces).not.toContain(PII_SENTINEL)
        expect(central.checkpoint()).toEqual({
          expectedSequence: sequence + 3,
          expectedPreviousBatchId: resend.batchId,
        })
      } finally {
        await central.close()
      }
    }

    it("automatically delivers every eligible case and supports withdraw/resend against current and previous contracts", async () => {
      const support = JSON.parse(await readFile(supportUrl, "utf8")) as {
        current: string
        supported: string[]
      }
      expect(support.supported.at(-1)).toBe(support.current)
      expect(support.supported.length).toBeGreaterThanOrEqual(2)
      const previous = support.supported.at(-2)!
      await exercisePositiveVersion(support.current)
      await exercisePositiveVersion(previous)
    }, 120_000)

    it("refuses invalid receipts and Central checkpoint mismatches without advancing local checkpoints", async () => {
      const support = JSON.parse(await readFile(supportUrl, "utf8")) as { current: string }
      const site = await createSite("negative")
      const sequence = await nextSequence()
      const siteId = `synthetic-site-${site.suffix}`
      const central = await startSyntheticCentral({
        contractVersion: support.current,
        siteId,
        siteSigningPublicKeyPem: sitePublicKeyPem,
        expectedSequence: sequence,
      })
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
      try {
        await configureInstallation({
          ...site,
          siteId,
          siteCode: "SYN-NEGATIVE",
          baseUrl: central.baseUrl,
          sequence,
          capabilities: central.capabilities,
        })
        await prisma.centralExportPolicy.update({
          where: { institutionId: site.institutionId },
          data: { enabled: true, approvedById: site.userId, approvedAt: new Date() },
        })
        const badReceiptCase = await createCompleteCase({
          ...site,
          label: "invalid-receipt",
        })
        central.setFailureMode("invalid-receipt-signature")
        await expect(processOneCentralDelivery("worker-invalid-receipt")).resolves.toBe(true)
        const invalidReceiptBatch = await trackLatestBatch(badReceiptCase.id)
        expect(invalidReceiptBatch.batch.status).toBe("RETRY")
        expect(invalidReceiptBatch.batch.errorCode).toBe("HOSPITAL_DELIVERY_FAILED")
        expect(invalidReceiptBatch.batch.errorMessage).toBe("Central receipt signature or identity is invalid")
        expect(await prisma.centralExportCheckpoint.findUnique({ where: { caseId: badReceiptCase.id } })).toBeNull()
        expect(central.checkpoint()).toEqual({
          expectedSequence: sequence,
          expectedPreviousBatchId: null,
        })

        // End this deliberately poisoned test attempt so a second independent
        // negative case can reach the real worker claim path.
        await prisma.centralDeliveryBatch.update({
          where: { id: invalidReceiptBatch.batchId },
          data: { status: "CANCELLED", nextAttemptAt: null, leaseOwner: null, leaseExpiresAt: null },
        })
        const badCheckpointCase = await createCompleteCase({
          ...site,
          label: "checkpoint-refusal",
        })
        central.setFailureMode("checkpoint-refusal")
        await expect(processOneCentralDelivery("worker-checkpoint-refusal")).resolves.toBe(true)
        const checkpointBatch = await trackLatestBatch(badCheckpointCase.id)
        expect(checkpointBatch.batch.status).toBe("RETRY")
        expect(checkpointBatch.batch.errorCode).toBe("CHECKPOINT_MISMATCH")
        expect(await prisma.centralExportCheckpoint.findUnique({ where: { caseId: badCheckpointCase.id } })).toBeNull()
        expect(central.checkpoint()).toEqual({
          expectedSequence: sequence,
          expectedPreviousBatchId: null,
        })
        await prisma.centralDeliveryBatch.update({
          where: { id: checkpointBatch.batchId },
          data: { status: "CANCELLED", nextAttemptAt: null, leaseOwner: null, leaseExpiresAt: null },
        })

        const safeFailureEvidence = JSON.stringify({
          observations: central.observations,
          logs: errorSpy.mock.calls,
          invalidReceipt: {
            code: invalidReceiptBatch.batch.errorCode,
            message: invalidReceiptBatch.batch.errorMessage,
          },
          invalidCheckpoint: {
            code: checkpointBatch.batch.errorCode,
            message: checkpointBatch.batch.errorMessage,
          },
          ui: [
            await readCaseCentralExport(prisma, { id: badReceiptCase.id }),
            await readCaseCentralExport(prisma, { id: badCheckpointCase.id }),
          ],
        })
        expect(safeFailureEvidence).not.toContain(PII_SENTINEL)
        expect(errorSpy.mock.calls).toEqual([
          ["[hospital-central-delivery] CENTRAL_DELIVERY_FAILED"],
          ["[hospital-central-delivery] CENTRAL_DELIVERY_FAILED"],
        ])
      } finally {
        errorSpy.mockRestore()
        await central.close()
      }
    }, 120_000)
  },
)
