import type { Prisma } from "@/generated/prisma/client"
import {
  encryptPatientIdentifier,
  maskPatientIdentifier,
  normalizePatientIdentifier,
  patientIdentifierHash,
  PATIENT_IDENTIFIER_HASH_VERSION,
  PATIENT_IDENTIFIER_KEY_VERSION,
  type PatientIdentifierTypeName,
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
  identifierType: PatientIdentifierTypeName = "IZ",
): Promise<PatientReference> {
  const normalized = normalizePatientIdentifier(patientIdentifier)
  if (!normalized) throw new Error("Patient identifier is required")
  if (normalized.length > 128) throw new Error("Patient identifier is too long")

  const identifierHash = patientIdentifierHash(institutionId, normalized, { identifierType })
  const existing = await client.patientLink.findUnique({
    where: {
      institutionId_identifierType_identifierHash: {
        institutionId, identifierType, identifierHash,
      },
    },
    select: { id: true, maskedIdentifier: true },
  })
  if (existing) return existing

  // Rows written before the type existed were hashed without it. They are all
  // record numbers, so only that space needs looking at — and finding one here
  // is what stops a second link being created for a patient who already has
  // one. Their hash is left as it was; the row is theirs either way.
  if (identifierType === "IZ") {
    const legacy = await client.patientLink.findUnique({
      where: {
        institutionId_identifierType_identifierHash: {
          institutionId,
          identifierType,
          identifierHash: patientIdentifierHash(
            institutionId, normalized, { identifierType, hashVersion: 1 },
          ),
        },
      },
      select: { id: true, maskedIdentifier: true },
    })
    if (legacy) return legacy
  }

  // Bound to the row it is about to become, so this ciphertext cannot be moved
  // onto another institution's link and still decrypt.
  const encrypted = encryptPatientIdentifier(normalized, { institutionId, identifierHash })
  // `createMany(skipDuplicates)` is safe both on the root Prisma client and
  // inside an interactive transaction. Catching a P2002 from `create()` and
  // then querying again is not transaction-safe in PostgreSQL: the constraint
  // error aborts the whole transaction. The no-op conflicting insert instead
  // lets concurrent case creates converge on the same local PatientLink.
  await client.patientLink.createMany({
    data: [{
      institutionId,
      identifierType,
      identifierHash,
      hashVersion: PATIENT_IDENTIFIER_HASH_VERSION,
      identifierCiphertext: encrypted.ciphertext,
      identifierNonce: encrypted.nonce,
      identifierAuthTag: encrypted.authTag,
      keyVersion: PATIENT_IDENTIFIER_KEY_VERSION,
      maskedIdentifier: maskPatientIdentifier(normalized),
      createdById: actorId,
    }],
    skipDuplicates: true,
  })
  const winner = await client.patientLink.findUnique({
    where: {
      institutionId_identifierType_identifierHash: {
        institutionId, identifierType, identifierHash,
      },
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

