import "server-only"

import { buildCodedHeader } from "@lospor/core/ehr-export-header"
import { buildSafetyFindings } from "@lospor/core/ehr-safety-findings"

import { decryptPatientIdentifier } from "./patient-identity"
import type { Prisma } from "@/generated/prisma/client"

/**
 * What actually gets sent for one queued delivery.
 *
 * Built from the finalization snapshot rather than the live tables. That is the
 * whole point of the snapshot existing: it is the document that was attested
 * to, hashed so it can be shown to be that document later. A case can be
 * unfinalized and corrected after a message is queued, and reading the live
 * record would send a version nobody signed — while the appliance's own
 * evidence said something else.
 */

export type EhrDeliveryPayloadClient = Pick<
  Prisma.TransactionClient,
  "ehrDelivery" | "caseFinalization" | "case"
>

export type EhrDeliveryPayload = {
  deliveryId: string
  kind: string
  /** What the hospital files this against. */
  patient: { identifierType: string; identifier: string } | null
  header: unknown
  documentUrl?: string
}

type SnapshotDocument = {
  id?: string
  patientLinkId?: string | null
  institutionId?: string | null
  preop?: Record<string, unknown> | null
  intraop?: Record<string, unknown> | null
  postop?: Record<string, unknown> | null
}

/**
 * The record number the hospital knows this patient by.
 *
 * Recovered from the stored ciphertext rather than kept in the clinical JSON —
 * which is exactly why PatientLink stores an encrypted identifier and not only
 * a hash. A hash is enough to find a patient again; it is not enough to tell a
 * hospital system which of its own records to file a protocol against.
 *
 * Returns null rather than throwing when it cannot be recovered. A message
 * without an identifier is useless to a hospital, so the caller refuses to
 * send it — but a decryption failure on one case must not stop the queue.
 */
function patientReference(
  link: {
    identifierType: string
    identifierCiphertext: string
    identifierNonce: string
    identifierAuthTag: string
    identifierHash: string
    institutionId: string
    keyVersion: number
  } | null,
): { identifierType: string; identifier: string } | null {
  if (!link) return null
  try {
    const identifier = decryptPatientIdentifier(
      {
        ciphertext: link.identifierCiphertext,
        nonce: link.identifierNonce,
        authTag: link.identifierAuthTag,
      },
      {
        keyVersion: link.keyVersion,
        binding: { institutionId: link.institutionId, identifierHash: link.identifierHash },
      },
    )
    return { identifierType: link.identifierType, identifier }
  } catch {
    // Never logged with the identifier in it.
    console.error("[ehr] EHR_PATIENT_REFERENCE_UNAVAILABLE")
    return null
  }
}

export async function buildEhrDeliveryPayload(
  client: EhrDeliveryPayloadClient,
  input: {
    deliveryId: string
    /** Resolves the printable record's URL; omitted for a structured-only message. */
    documentUrlFor?: (caseId: string) => Promise<string | null>
  },
): Promise<EhrDeliveryPayload | null> {
  const delivery = await client.ehrDelivery.findFirst({
    where: { id: input.deliveryId },
    select: { id: true, kind: true, caseId: true, finalizationId: true, sequence: true },
  })
  if (!delivery) return null

  const kind = String(delivery.kind)

  // A start or end signal describes a moment, not a finalized record, so there
  // is no snapshot behind it and nothing to read one from.
  const finalization = kind === "CASE_START" || kind === "CASE_END"
    ? null
    : await client.caseFinalization.findFirst({
        where: { id: String(delivery.finalizationId) },
        select: {
          id: true, sequence: true, finalizedAt: true,
          snapshotDocument: true, supersedesFinalizationId: true,
        },
      })

  if (!finalization && kind !== "CASE_START" && kind !== "CASE_END") return null

  let snapshot: SnapshotDocument = {}
  if (finalization) {
    try {
      snapshot = JSON.parse(String(finalization.snapshotDocument)) as SnapshotDocument
    } catch {
      // A snapshot that cannot be parsed is a corrupted attestation. Sending
      // nothing is right: whatever the hospital received would not be the
      // document the hash attests to.
      console.error("[ehr] EHR_SNAPSHOT_UNREADABLE")
      return null
    }
  }

  const record = await client.case.findFirst({
    where: { id: String(delivery.caseId) },
    select: {
      patientLink: {
        select: {
          identifierType: true, identifierCiphertext: true, identifierNonce: true,
          identifierAuthTag: true, identifierHash: true, institutionId: true,
          keyVersion: true,
        },
      },
    },
  })

  const patient = patientReference(
    (record?.patientLink ?? null) as Parameters<typeof patientReference>[0],
  )

  if (kind === "SAFETY_FINDINGS") {
    return {
      deliveryId: String(delivery.id),
      kind,
      patient,
      header: {
        findings: buildSafetyFindings({
          preop: snapshot.preop as Parameters<typeof buildSafetyFindings>[0]["preop"],
          intraop: snapshot.intraop as Parameters<typeof buildSafetyFindings>[0]["intraop"],
        }),
      },
    }
  }

  if (kind === "CASE_START" || kind === "CASE_END") {
    return {
      deliveryId: String(delivery.id),
      kind,
      patient,
      header: { kind, caseId: String(delivery.caseId), at: new Date().toISOString() },
    }
  }

  const header = buildCodedHeader({
    finalization: {
      sequence: Number(finalization!.sequence),
      finalizedAt: (finalization!.finalizedAt as Date).toISOString(),
      ...(finalization!.supersedesFinalizationId
        ? { supersedes: String(finalization!.supersedesFinalizationId) }
        : {}),
    },
    intraop: snapshot.intraop as Parameters<typeof buildCodedHeader>[0]["intraop"],
    postop: snapshot.postop as Parameters<typeof buildCodedHeader>[0]["postop"],
  })

  const documentUrl = input.documentUrlFor
    ? await input.documentUrlFor(String(delivery.caseId))
    : null

  return {
    deliveryId: String(delivery.id),
    kind,
    patient,
    header,
    ...(documentUrl ? { documentUrl } : {}),
  }
}
