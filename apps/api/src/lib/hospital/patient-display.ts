import "server-only"

import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { decryptPatientIdentifier } from "@/lib/hospital/patient-identity"
import { patientIdentifierCapabilityState } from "@/lib/hospital/patient-identifier-policy"

type Database = PrismaClient | Prisma.TransactionClient

/** What a clinician sees beside a case while it is open (hospital 1.8.0). */
export type PatientDisplay = {
  /** The full ИЗ № with its year, e.g. "1234/2026"; null when it cannot be shown. */
  admissionNumber: string | null
  /** The first six digits of the ЕГН (the birth date) once the person is known. */
  egnPrefix: string | null
}

/** The selection a case query needs for {@link patientDisplayOf}. */
export const patientDisplaySelect = {
  id: true,
  institutionId: true,
  identifierType: true,
  identifierYear: true,
  identifierHash: true,
  identifierCiphertext: true,
  identifierNonce: true,
  identifierAuthTag: true,
  keyVersion: true,
  personLink: {
    select: {
      institutionId: true,
      identifierHash: true,
      identifierCiphertext: true,
      identifierNonce: true,
      identifierAuthTag: true,
      keyVersion: true,
    },
  },
} satisfies Prisma.PatientLinkSelect

type DisplayLink = Prisma.PatientLinkGetPayload<{ select: typeof patientDisplaySelect }>

/** Whether this site shows the number at all. A failed read falls back to hidden. */
export async function admissionNumberVisible(db: Database = prisma): Promise<boolean> {
  try {
    return (await patientIdentifierCapabilityState(db)).admissionNumberVisible
  } catch {
    return false
  }
}

function open(link: { institutionId: string; identifierHash: string; identifierCiphertext: string; identifierNonce: string; identifierAuthTag: string; keyVersion: number }): string | null {
  try {
    return decryptPatientIdentifier(
      { ciphertext: link.identifierCiphertext, nonce: link.identifierNonce, authTag: link.identifierAuthTag },
      { keyVersion: link.keyVersion, binding: { institutionId: link.institutionId, identifierHash: link.identifierHash } },
    )
  } catch {
    // An unreadable row shows nothing rather than failing the whole list.
    return null
  }
}

/**
 * The number as a clinician writes it. Nothing else of the identifier leaves
 * this function: an ЕГН is cut to its first six digits before it is returned.
 */
export function patientDisplayOf(link: DisplayLink | null | undefined): PatientDisplay | null {
  if (!link) return null
  const plain = link.identifierType === "IZ" ? open(link) : null
  const egn = link.personLink ? open(link.personLink) : link.identifierType === "EGN" ? open(link) : null
  const admissionNumber = plain ? (link.identifierYear > 0 ? `${plain}/${link.identifierYear}` : plain) : null
  const egnPrefix = egn && /^\d{10}$/.test(egn) ? egn.slice(0, 6) : null
  if (!admissionNumber && !egnPrefix) return null
  return { admissionNumber, egnPrefix }
}
