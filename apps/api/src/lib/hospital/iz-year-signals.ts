import type { Prisma } from "@/generated/prisma/client"
import { importIdentityCandidates } from "@/lib/hospital/ehr-import"
import { departmentYear, izNumberValue, suggestIzYear, type IzYearChoice } from "@/lib/hospital/iz-year"
import {
  decryptPatientIdentifier,
  normalizePatientIdentifier,
  patientIdentifierHash,
} from "@/lib/hospital/patient-identity"

type SignalClient = Pick<Prisma.TransactionClient, "patientLink" | "ehrImport">

const HIGHEST_TTL_MS = 10 * 60_000
const highestCache = new Map<string, { value: number | null; at: number }>()

/**
 * The highest ИЗ № this appliance holds for a year. Only the leading digits
 * count, and nothing but that one number leaves this function. Kept for ten
 * minutes: it moves slowly and is read on every typed number in January.
 */
export async function highestIzNumber(
  client: SignalClient,
  institutionId: string,
  year: number,
  now = Date.now(),
): Promise<number | null> {
  const cacheKey = `${institutionId}\0${year}`
  const cached = highestCache.get(cacheKey)
  if (cached && now - cached.at < HIGHEST_TTL_MS) return cached.value
  const links = await client.patientLink.findMany({
    where: { institutionId, identifierType: "IZ", identifierYear: year },
    select: { identifierHash: true, identifierCiphertext: true, identifierNonce: true, identifierAuthTag: true, keyVersion: true },
  })
  let highest: number | null = null
  for (const link of links) {
    let plain: string
    try {
      plain = decryptPatientIdentifier(
        { ciphertext: link.identifierCiphertext, nonce: link.identifierNonce, authTag: link.identifierAuthTag },
        { keyVersion: link.keyVersion, binding: { institutionId, identifierHash: link.identifierHash } },
      )
    } catch {
      continue
    }
    const value = izNumberValue(plain)
    if (value !== null && (highest === null || value > highest)) highest = value
  }
  highestCache.set(cacheKey, { value: highest, at: now })
  return highest
}

/** The years this number already has a case under on this appliance. */
async function yearsWithCase(client: SignalClient, institutionId: string, identifier: string, years: number[]): Promise<number[]> {
  const normalized = normalizePatientIdentifier(identifier)
  const found: number[] = []
  for (const identifierYear of years) {
    const hashes = [2, 1].map(hashVersion =>
      patientIdentifierHash(institutionId, normalized, { identifierType: "IZ", identifierYear, hashVersion }))
    const link = await client.patientLink.findFirst({
      where: { institutionId, identifierType: "IZ", identifierYear, identifierHash: { in: hashes }, cases: { some: {} } },
      select: { id: true },
    })
    if (link) found.push(identifierYear)
  }
  return found
}

/** The years a pending EHR import is staged under for this number. */
async function yearsWithEhrImport(client: SignalClient, institutionId: string, identifier: string, at: Date): Promise<number[]> {
  const found: number[] = []
  for (const identity of importIdentityCandidates(institutionId, "IZ", identifier, at)) {
    const row = await client.ehrImport.findFirst({
      where: {
        institutionId,
        identifierType: identity.identifierType,
        identifierHash: identity.identifierHash,
        status: "PENDING",
        expiresAt: { gt: at },
      },
      select: { id: true },
    })
    if (row) found.push(identity.identifierYear)
  }
  return found
}

/**
 * Everything the year choice needs, for one typed number. Outside the first
 * 60 days nothing is read at all. An earlier case filed under one of the two
 * years wins over everything, because that admission is already in LOSPOR.
 */
export async function checkIzYear(
  client: SignalClient,
  institutionId: string,
  identifier: string,
  at = new Date(),
): Promise<IzYearChoice> {
  const year = departmentYear(at)
  const closed = suggestIzYear({ identifier, at, thisYearHighest: null, lastYearHighest: null, ehrYears: [] })
  if (!closed.open || !normalizePatientIdentifier(identifier)) return closed

  const withCase = await yearsWithCase(client, institutionId, identifier, [year, year - 1])
  if (withCase.length === 1) return { ...closed, suggestedYear: withCase[0], reason: "earlier-case" }

  const [ehrYears, thisYearHighest, lastYearHighest] = await Promise.all([
    yearsWithEhrImport(client, institutionId, identifier, at),
    highestIzNumber(client, institutionId, year, at.getTime()),
    highestIzNumber(client, institutionId, year - 1, at.getTime()),
  ])
  return suggestIzYear({ identifier, at, thisYearHighest, lastYearHighest, ehrYears })
}

/** Test hook: forget the cached highest numbers. */
export function clearIzHighestCache(): void {
  highestCache.clear()
}
