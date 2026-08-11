import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import {
  EXCHANGE_SCHEMA,
  canonicalJson,
  MANIFEST_VERSION,
  type CaseAction,
  type ExchangeManifestV1,
} from "@lospor/exchange-contract"
import { Prisma } from "@/generated/prisma/client"
import {
  mapCasesToOmop,
  omopSourceIds,
  type ExportContext,
} from "@/lib/omop-mapper"
import { CASE_SELECT, redactExportRow } from "@/lib/omop-export-source"
import { prisma } from "@/lib/prisma"
import {
  caseExportPseudonym,
  patientExportPseudonym,
} from "./patient-identity"
import { createOmopArchive } from "./omop-archive"
import { encryptAndSignPayload } from "./exchange-crypto"
import { hospitalConfig } from "./config"
import { sha256 } from "./hash"

type ExportRow = Prisma.CaseGetPayload<{ select: typeof CASE_SELECT }>

type ReservedCase = {
  row: ExportRow
  action: CaseAction
  casePseudonym: string
  personPseudonym: string
  sourcePersonId: string
  sourceObservationPeriodId: string
  sourceVisitId: string
  exclusionReasonCode: string | null
}

function revisionsChanged(row: ExportRow): boolean {
  const prior = row.centralExportCheckpoint
  if (!prior || prior.lastAction !== "UPSERT") return true
  return prior.clinicalRevision !== row.clinicalRevision ||
    prior.eventRevision !== row.eventRevision ||
    prior.relationalRevision !== row.relationalRevision ||
    prior.preopRevision !== (row.preop?.syncRevision ?? null) ||
    prior.intraopRevision !== (row.intraop?.syncRevision ?? null) ||
    prior.postopRevision !== (row.postop?.syncRevision ?? null)
}

function identityContext(rows: readonly ExportRow[]): NonNullable<ExportContext["identityByCase"]> {
  return Object.fromEntries(rows.flatMap(row => {
    const identifierHash = row.patientLink?.identifierHash
    if (!identifierHash || !row.institutionId) return []
    return [[row.id, {
      personKey: identifierHash,
      personSourceValue: patientExportPseudonym(row.institutionId, identifierHash),
    }]]
  }))
}

function reserveCase(row: ExportRow, action: CaseAction): ReservedCase | null {
  if (!row.institutionId || !row.patientLink?.identifierHash || !row.finalizedAt) {
    return null
  }
  const identityByCase = identityContext([row])
  const source = omopSourceIds(row.id, { identityByCase })
  return {
    row,
    action,
    casePseudonym: caseExportPseudonym(row.institutionId, row.id),
    personPseudonym: patientExportPseudonym(
      row.institutionId,
      row.patientLink.identifierHash,
    ),
    sourcePersonId: String(source.personId),
    sourceObservationPeriodId: String(source.observationPeriodId),
    sourceVisitId: String(source.visitId),
    exclusionReasonCode: row.centralExportControl?.reasonCode ?? null,
  }
}

function qualityPasses(row: ExportRow): boolean {
  const identityByCase = identityContext([row])
  const bundle = mapCasesToOmop([redactExportRow(row)], {
    userId: "hospital-export-worker",
    userRole: "SYSTEM",
    statusFilter: ["COMPLETE"],
    excludedCaseCount: 0,
    matchingCaseCount: 1,
    complete: true,
    gitCommit: process.env.GIT_COMMIT_SHA ?? "untracked",
    forcedOverride: false,
    identityByCase,
  })
  return bundle.metadata.data_quality_status !== "FAIL"
}

export async function reserveNextCentralBatch(): Promise<string | null> {
  const config = hospitalConfig()
  return prisma.$transaction(async tx => {
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, and the
    // Prisma driver adapter cannot deserialise a void column — it raises
    // UnsupportedNativeDataType and the whole transaction fails. Nothing reads
    // the result, so running it as a command sidesteps deserialisation
    // entirely. Taken from a standalone appliance where the delivery worker was
    // failing with HTTP 500 on every pass.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lospor-hospital-central-export'))`
    const active = await tx.centralDeliveryBatch.findFirst({
      where: {
        status: {
          in: [
            "PENDING", "GENERATING", "READY", "UPLOADING",
            "AWAITING_RECEIPT", "RETRY",
          ],
        },
      },
      orderBy: { sequence: "asc" },
      select: { id: true },
    })
    if (active) return active.id

    const installation = await tx.hospitalInstallation.findUnique({
      where: { id: "local" },
    })
    if (!installation?.centralEnabled ||
        !installation.siteId ||
        !installation.siteCode ||
        !installation.institutionId ||
        !installation.centralBaseUrl) {
      return null
    }
    const policy = await tx.centralExportPolicy.findUnique({
      where: { institutionId: installation.institutionId },
    })
    if (!policy?.enabled || !policy.approvedAt) return null

    const rows = await tx.case.findMany({
      where: {
        institutionId: installation.institutionId,
        status: "COMPLETE",
        finalizedAt: { not: null },
      },
      select: CASE_SELECT,
      orderBy: [{ finalizedAt: "asc" }, { id: "asc" }],
      take: config.HOSPITAL_EXPORT_BATCH_CASE_LIMIT * 3,
    })

    const selected: ReservedCase[] = []
    let caseExcluded = 0
    let qualityRejected = 0
    let withdrawn = 0
    for (const row of rows) {
      const decision = row.centralExportControl?.decision ?? "DEFAULT"
      if (decision === "EXCLUDE" || decision === "WITHDRAWN") {
        caseExcluded += 1
        continue
      }
      if (decision === "WITHDRAW_REQUESTED") {
        if (!row.centralExportCheckpoint) {
          caseExcluded += 1
          continue
        }
        const item = reserveCase(row, "WITHDRAW")
        if (!item) {
          qualityRejected += 1
          continue
        }
        selected.push(item)
        withdrawn += 1
      } else if (revisionsChanged(row)) {
        const item = reserveCase(row, "UPSERT")
        if (!item || !qualityPasses(row)) {
          qualityRejected += 1
          continue
        }
        selected.push(item)
      }
      if (selected.length >= config.HOSPITAL_EXPORT_BATCH_CASE_LIMIT) break
    }
    if (!selected.length) return null

    const batchId = randomUUID()
    const cutoffTo = new Date()
    await tx.centralDeliveryBatch.create({
      data: {
        id: batchId,
        sequence: installation.nextSequence,
        previousBatchId: installation.lastAcceptedBatchId,
        cutoffFrom: installation.lastDeliveryAt,
        cutoffTo,
        status: "PENDING",
        caseExcluded,
        qualityRejected,
        withdrawnCount: withdrawn,
        cases: {
          create: selected.map(item => ({
            caseId: item.row.id,
            action: item.action,
            casePseudonym: item.casePseudonym,
            personPseudonym: item.personPseudonym,
            sourcePersonId: item.sourcePersonId,
            sourceObservationPeriodId: item.sourceObservationPeriodId,
            sourceVisitId: item.sourceVisitId,
            clinicalRevision: item.row.clinicalRevision,
            eventRevision: item.row.eventRevision,
            relationalRevision: item.row.relationalRevision,
            preopRevision: item.row.preop?.syncRevision ?? null,
            intraopRevision: item.row.intraop?.syncRevision ?? null,
            postopRevision: item.row.postop?.syncRevision ?? null,
            finalizedAt: item.row.finalizedAt!,
            operationStartedAt: item.row.intraop?.startedAt ?? null,
            exclusionReasonCode: item.exclusionReasonCode,
          })),
        },
      },
    })
    await tx.hospitalInstallation.update({
      where: { id: "local" },
      data: { nextSequence: { increment: 1 } },
    })
    return batchId
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 })
}

export async function generateCentralBatchArtifacts(batchId: string): Promise<void> {
  const config = hospitalConfig()
  const batch = await prisma.centralDeliveryBatch.findUnique({
    where: { id: batchId },
    include: {
      cases: {
        orderBy: { caseId: "asc" },
        include: { case: { select: CASE_SELECT } },
      },
    },
  })
  const installation = await prisma.hospitalInstallation.findUnique({
    where: { id: "local" },
  })
  if (!batch || !installation?.siteId || !installation.siteCode ||
      !installation.institutionId || !installation.centralEncryptionKeyId ||
      !installation.centralEncryptionPublicKeyPem || !installation.signingKeyId) {
    throw new Error("Hospital installation or batch is incomplete")
  }
  if (batch.status !== "PENDING" && batch.status !== "RETRY") return

  await prisma.centralDeliveryBatch.update({
    where: { id: batch.id },
    data: { status: "GENERATING", errorCode: null, errorMessage: null },
  })

  const upserts = batch.cases.filter(item => item.action === "UPSERT")
  const rows = upserts.map(item => item.case)
  const identityByCase = identityContext(rows)
  const generatedAt = new Date().toISOString()
  const bundle = mapCasesToOmop(rows.map(redactExportRow), {
    userId: "hospital-export-worker",
    userRole: "SYSTEM",
    statusFilter: ["COMPLETE"],
    excludedCaseCount: batch.caseExcluded + batch.qualityRejected,
    matchingCaseCount: rows.length,
    complete: true,
    gitCommit: process.env.GIT_COMMIT_SHA ?? "untracked",
    forcedOverride: false,
    exportId: batch.id,
    generatedAt,
    identityByCase,
  })
  if (bundle.metadata.data_quality_status === "FAIL") {
    throw new Error("Reserved cases no longer pass the OMOP quality gate")
  }

  const directory = join(config.HOSPITAL_EXPORT_DIR, batch.id)
  const plaintextPath = join(directory, "payload.zip")
  const ciphertextPath = join(directory, "payload.enc")
  await rm(plaintextPath, { force: true })
  await rm(ciphertextPath, { force: true })
  const archive = await createOmopArchive(bundle, plaintextPath)

  const policy = await prisma.centralExportPolicy.findUnique({
    where: { institutionId: installation.institutionId },
  })
  const manifest: ExchangeManifestV1 = {
    schema: EXCHANGE_SCHEMA,
    manifestVersion: MANIFEST_VERSION,
    batchId: batch.id,
    sequence: batch.sequence,
    previousBatchId: batch.previousBatchId,
    generatedAt,
    cutoffFrom: batch.cutoffFrom?.toISOString() ?? null,
    cutoffTo: batch.cutoffTo.toISOString(),
    site: {
      siteId: installation.siteId,
      siteCode: installation.siteCode,
      institutionId: installation.institutionId,
    },
    versions: {
      hospital: "1.0.0",
      api: "7.3.2-hospital.1",
      core: "7.3.0",
      omopSource: bundle.metadata.source_version,
      databaseSchema: "hospital-1",
      conceptMap: bundle.metadata.concept_map_version,
      // Read from the bundle that was just generated, never written by hand:
      // it must name the vocabulary this batch was actually encoded in. Central
      // rejects a manifest without it, because once two sites run different
      // vintages there is no way to tell their rows apart after the fact.
      dataDictionary: bundle.metadata.data_dictionary_version,
      redactionProfile: policy?.redactionProfile ?? "bg-en-v1",
    },
    qualityStatus: bundle.metadata.data_quality_status,
    cases: batch.cases.map(item => {
      return {
        casePseudonym: item.casePseudonym,
        personPseudonym: item.personPseudonym,
        sourcePersonId: item.sourcePersonId,
        sourceObservationPeriodId: item.sourceObservationPeriodId,
        sourceVisitId: item.sourceVisitId,
        action: item.action as CaseAction,
        clinicalRevision: item.clinicalRevision,
        eventRevision: item.eventRevision,
        relationalRevision: item.relationalRevision,
        preopRevision: item.preopRevision,
        intraopRevision: item.intraopRevision,
        postopRevision: item.postopRevision,
        finalizedAt: item.finalizedAt.toISOString(),
        operationStartedAt: item.operationStartedAt?.toISOString() ?? null,
        exclusionReasonCode: item.exclusionReasonCode,
      }
    }),
    tables: archive.tables,
    exclusions: {
      policyExcluded: batch.policyExcluded,
      caseExcluded: batch.caseExcluded,
      qualityRejected: batch.qualityRejected,
      withdrawn: batch.withdrawnCount,
    },
    payloadSha256: archive.payloadSha256,
  }
  const envelope = await encryptAndSignPayload({
    plaintextPath,
    ciphertextPath,
    manifest,
    centralEncryptionKeyId: installation.centralEncryptionKeyId,
    centralEncryptionPublicKeyPem: installation.centralEncryptionPublicKeyPem,
    siteSigningKeyId: installation.signingKeyId,
    siteSigningPrivateKeyFile: config.HOSPITAL_SITE_SIGNING_PRIVATE_KEY_FILE,
  })
  await rm(plaintextPath, { force: true })
  if (installation.maximumUploadBytes &&
      envelope.ciphertextByteSize > installation.maximumUploadBytes) {
    await rm(ciphertextPath, { force: true })
    throw new Error("Encrypted batch exceeds Central's maximum upload size")
  }

  await prisma.centralDeliveryBatch.update({
    where: { id: batch.id },
    data: {
      status: "READY",
      manifest: manifest as unknown as Prisma.InputJsonValue,
      manifestHash: sha256(canonicalJson(manifest)),
      plaintextArtifactPath: null,
      plaintextSha256: archive.payloadSha256,
      ciphertextArtifactPath: ciphertextPath,
      ciphertextSha256: envelope.ciphertextSha256,
      ciphertextByteSize: BigInt(envelope.ciphertextByteSize),
      envelope: envelope as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(generatedAt),
    },
  })
}

