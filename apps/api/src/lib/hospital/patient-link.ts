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
  try {
    return await client.patientLink.create({
      data: {
        institutionId,
        identifierHash,
        identifierCiphertext: encrypted.ciphertext,
        identifierNonce: encrypted.nonce,
        identifierAuthTag: encrypted.authTag,
        maskedIdentifier: maskPatientIdentifier(normalized),
        createdById: actorId,
      },
      select: { id: true, maskedIdentifier: true },
    })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code !== "P2002") throw error
    const winner = await client.patientLink.findUnique({
      where: {
        institutionId_identifierHash: { institutionId, identifierHash },
      },
      select: { id: true, maskedIdentifier: true },
    })
    if (!winner) throw error
    return winner
  }
}

