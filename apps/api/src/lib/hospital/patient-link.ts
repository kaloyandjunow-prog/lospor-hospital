import type { Prisma } from "@/generated/prisma/client"
import {
  encryptPatientIdentifier,
  maskPatientIdentifier,
  normalizePatientIdentifier,
  patientIdentifierHash,
} from "./patient-identity"

export type PatientReference = {
  id: string
  maskedIdentifier: string
}

type PatientLinkClient = Pick<Prisma.TransactionClient, "patientLink">

export async function resolvePatientLink(
  client: PatientLinkClient,
  institutionId: string,
  patientIdentifier: string,
  actorId: string,
): Promise<PatientReference> {
  const normalized = normalizePatientIdentifier(patientIdentifier)
  if (!normalized) throw new Error("Patient identifier is required")
  if (normalized.length > 128) throw new Error("Patient identifier is too long")

  const identifierHash = patientIdentifierHash(institutionId, normalized)
  const existing = await client.patientLink.findUnique({
    where: {
      institutionId_identifierHash: { institutionId, identifierHash },
    },
    select: { id: true, maskedIdentifier: true },
  })
  if (existing) return existing

  const encrypted = encryptPatientIdentifier(normalized)
  // `createMany(skipDuplicates)` is safe both on the root Prisma client and
  // inside an interactive transaction. Catching a P2002 from `create()` and
  // then querying again is not transaction-safe in PostgreSQL: the constraint
  // error aborts the whole transaction. The no-op conflicting insert instead
  // lets concurrent case creates converge on the same local PatientLink.
  await client.patientLink.createMany({
    data: [{
      institutionId,
      identifierHash,
      identifierCiphertext: encrypted.ciphertext,
      identifierNonce: encrypted.nonce,
      identifierAuthTag: encrypted.authTag,
      maskedIdentifier: maskPatientIdentifier(normalized),
      createdById: actorId,
    }],
    skipDuplicates: true,
  })
  const winner = await client.patientLink.findUnique({
    where: {
      institutionId_identifierHash: { institutionId, identifierHash },
    },
    select: { id: true, maskedIdentifier: true },
  })
  if (!winner) throw new Error("Patient link could not be resolved")
  return winner
}

/** Remove an identifier only after its final case reference has gone away. */
export async function deletePatientLinkIfOrphaned(
  client: PatientLinkClient,
  patientLinkId: string | null | undefined,
): Promise<void> {
  if (!patientLinkId) return
  await client.patientLink.deleteMany({
    where: { id: patientLinkId, cases: { none: {} } },
  })
}

