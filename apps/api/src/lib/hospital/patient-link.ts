import type { Prisma } from "@/generated/prisma/client"
import { assertEgnLinkingPermitted } from "./patient-identifier-policy"
import {
  encryptPatientIdentifier,
  maskPatientIdentifier,
  normalizePatientIdentifier,
  identifierYearFor,
  patientIdentifierHash,
  PATIENT_IDENTIFIER_HASH_VERSION,
  PATIENT_IDENTIFIER_KEY_VERSION,
  type PatientIdentifierTypeName,
} from "./patient-identity"

export type PatientReference = {
  id: string
  maskedIdentifier: string
}

type PatientLinkClient =
  Pick<Prisma.TransactionClient, "patientLink" | "hospitalPatientIdentifierPolicy">

export async function resolvePatientLink(
  client: PatientLinkClient,
  institutionId: string,
  patientIdentifier: string,
  actorId: string,
  identifierType: PatientIdentifierTypeName = "IZ",
  /**
   * Which year's numbering the identifier belongs to. A record number is only
   * unique within its year, and no case date exists yet at creation, so the
   * caller passes the moment the link is being made.
   */
  at: Date = new Date(),
): Promise<PatientReference> {
  // Checked before anything else: an existing EGN link found below would let a
  // disabled policy look like it still worked for every admission that
  // already has one, and a caller cannot tell "found" from "silently allowed"
  // apart from a masked identifier alone.
  if (identifierType === "EGN") await assertEgnLinkingPermitted(client)

  const normalized = normalizePatientIdentifier(patientIdentifier)
  if (!normalized) throw new Error("Patient identifier is required")
  if (normalized.length > 128) throw new Error("Patient identifier is too long")

  const identifierYear = identifierYearFor(identifierType, at)
  const identifierHash = patientIdentifierHash(
    institutionId, normalized, { identifierType, identifierYear },
  )
  const existing = await client.patientLink.findUnique({
    where: {
      institutionId_identifierType_identifierYear_identifierHash: {
        institutionId, identifierType, identifierYear, identifierHash,
      },
    },
    select: { id: true, maskedIdentifier: true },
  })
  if (existing) return existing

  // Rows written before the type and year existed were hashed without either.
  // They are all record numbers, and the migration attributed them to the year
  // they were created in, so the year still scopes the search: without that a
  // link made last year would be returned for this year's identical number.
  // Finding one here is what stops a second link being created for an admission
  // that already has one. Their hash is left as it was; the row is theirs.
  if (identifierType === "IZ") {
    const legacy = await client.patientLink.findUnique({
      where: {
        institutionId_identifierType_identifierYear_identifierHash: {
          institutionId,
          identifierType,
          identifierYear,
          identifierHash: patientIdentifierHash(
            institutionId, normalized, { identifierType, identifierYear, hashVersion: 1 },
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
      identifierYear,
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
      institutionId_identifierType_identifierYear_identifierHash: {
        institutionId, identifierType, identifierYear, identifierHash,
      },
    },
    select: { id: true, maskedIdentifier: true },
  })
  if (!winner) throw new Error("Patient link could not be resolved")
  return winner
}

export type PatientIdentity = {
  /** The admission a case belongs to. This is what a case references. */
  admission: PatientReference
  /** The person behind it, when a national identifier is known. */
  person: PatientReference | null
}

/**
 * Resolve both halves of who a case is about.
 *
 * The record number is required and identifies the admission; the national
 * identifier is optional and identifies the person. Keeping both is the point:
 * one distinguishes this admission from the next, the other is what makes two
 * admissions the same patient. A site that has not enabled national identifiers
 * simply never passes one, and every consumer falls back to the admission's own
 * identity as it did before.
 */
export async function resolvePatientIdentity(
  client: PatientLinkClient,
  institutionId: string,
  identifiers: { recordNumber: string; nationalId?: string | null },
  actorId: string,
  at: Date = new Date(),
): Promise<PatientIdentity> {
  const admission = await resolvePatientLink(
    client, institutionId, identifiers.recordNumber, actorId, "IZ", at,
  )
  if (!identifiers.nationalId?.trim()) return { admission, person: null }

  const person = await resolvePatientLink(
    client, institutionId, identifiers.nationalId, actorId, "EGN", at,
  )
  // Attaching is idempotent and only ever fills a gap: a person already
  // recorded for this admission is not overwritten by a later import, because
  // correcting who a patient is should be a deliberate act rather than a side
  // effect of a feed.
  await client.patientLink.updateMany({
    where: { id: admission.id, personLinkId: null },
    data: { personLinkId: person.id },
  })
  return { admission, person }
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

