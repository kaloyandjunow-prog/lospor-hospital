import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// @/lib/prisma imports "server-only", which throws outside a Server Component.
// Every other Postgres suite stubs it; this one did not, so the file failed to
// load the moment LOSPOR_POSTGRES_INTEGRATION was set — which only ever
// happened in CI, and CI had never reached the test step.
vi.mock("server-only", () => ({}))

const runPostgres = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"

describe.skipIf(!runPostgres)("Hospital patient linkage in PostgreSQL", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let resolvePatientLink: typeof import("@/lib/hospital/patient-link").resolvePatientLink
  let deletePatientLinkIfOrphaned:
    typeof import("@/lib/hospital/patient-link").deletePatientLinkIfOrphaned
  let decryptPatientIdentifier:
    typeof import("@/lib/hospital/patient-identity").decryptPatientIdentifier
  const suffix = randomUUID()
  const institutionIds = [
    `patient-link-institution-a-${suffix}`,
    `patient-link-institution-b-${suffix}`,
  ]
  const userId = `patient-link-user-${suffix}`
  const caseIds = [
    `patient-link-case-a-${suffix}`,
    `patient-link-case-b-${suffix}`,
  ]

  beforeAll(async () => {
    process.env.HOSPITAL_PATIENT_HMAC_KEY = randomBytes(32).toString("base64")
    process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY = randomBytes(32).toString("base64")
    ;({ prisma } = await import("@/lib/prisma"))
    ;({ resolvePatientLink, deletePatientLinkIfOrphaned } = await import("@/lib/hospital/patient-link"))
    ;({ decryptPatientIdentifier } = await import("@/lib/hospital/patient-identity"))

    await prisma.institution.createMany({
      data: institutionIds.map((id, index) => ({
        id,
        name: `Patient linkage hospital ${index + 1}`,
        city: "Test",
      })),
    })
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Patient linkage user",
        passwordHash: "not-a-real-password",
        institutionId: institutionIds[0],
      },
    })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.case.deleteMany({ where: { id: { in: caseIds } } })
    await prisma.patientLink.deleteMany({
      where: { institutionId: { in: institutionIds } },
    })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.institution.deleteMany({
      where: { id: { in: institutionIds } },
    })
    await prisma.$disconnect()
  })

  it("single-flights concurrent creation and links repeat procedures locally", async () => {
    const [left, right] = await Promise.all([
      resolvePatientLink(
        prisma,
        institutionIds[0]!,
        "  000123-А  ",
        userId,
      ),
      resolvePatientLink(
        prisma,
        institutionIds[0]!,
        "０００１２３-а",
        userId,
      ),
    ])

    expect(left.id).toBe(right.id)
    expect(left.maskedIdentifier).toBe("00****-А")
    expect(await prisma.patientLink.count({
      where: { institutionId: institutionIds[0] },
    })).toBe(1)

    await prisma.case.createMany({
      data: caseIds.map(id => ({
        id,
        userId,
        institutionId: institutionIds[0],
        patientLinkId: left.id,
      })),
    })
    expect(await prisma.case.count({
      where: { patientLinkId: left.id },
    })).toBe(2)

    const encrypted = await prisma.patientLink.findUniqueOrThrow({
      where: { id: left.id },
    })
    expect(encrypted.identifierCiphertext).not.toContain("000123")
    // Reading it back needs the row it belongs to, which is the point: the
    // ciphertext is bound to its institution and identifier hash, so it cannot
    // be moved onto another link and still decrypt.
    expect(decryptPatientIdentifier({
      ciphertext: encrypted.identifierCiphertext,
      nonce: encrypted.identifierNonce,
      authTag: encrypted.identifierAuthTag,
    }, {
      keyVersion: encrypted.keyVersion,
      binding: {
        institutionId: encrypted.institutionId,
        identifierHash: encrypted.identifierHash,
      },
    })).toBe("000123-А")
  })

  it("never links the same local number across institutions", async () => {
    const local = await prisma.patientLink.findFirstOrThrow({
      where: { institutionId: institutionIds[0] },
    })
    const other = await resolvePatientLink(
      prisma,
      institutionIds[1]!,
      "000123-А",
      userId,
    )
    expect(other.id).not.toBe(local.id)
    const otherRow = await prisma.patientLink.findUniqueOrThrow({
      where: { id: other.id },
    })
    expect(otherRow.identifierHash).not.toBe(local.identifierHash)
  })

  it("rolls a newly encrypted identifier back when its case write fails", async () => {
    const rawNumber = `ROLLBACK-${suffix}`
    await expect(prisma.$transaction(async tx => {
      await resolvePatientLink(tx, institutionIds[0]!, rawNumber, userId)
      throw new Error("synthetic case-write failure")
    })).rejects.toThrow("synthetic case-write failure")

    expect(await prisma.patientLink.count({
      where: {
        institutionId: institutionIds[0],
        maskedIdentifier: { endsWith: rawNumber.slice(-2) },
      },
    })).toBe(0)
  })

  it("deletes an orphan but preserves an identifier still referenced by a case", async () => {
    const link = await resolvePatientLink(
      prisma,
      institutionIds[0]!,
      `LIFECYCLE-${suffix}`,
      userId,
    )
    const caseId = `patient-link-lifecycle-${suffix}`
    caseIds.push(caseId)
    await prisma.case.create({
      data: {
        id: caseId,
        userId,
        institutionId: institutionIds[0],
        patientLinkId: link.id,
      },
    })

    await deletePatientLinkIfOrphaned(prisma, link.id)
    expect(await prisma.patientLink.findUnique({ where: { id: link.id } })).not.toBeNull()

    await prisma.case.delete({ where: { id: caseId } })
    await deletePatientLinkIfOrphaned(prisma, link.id)
    expect(await prisma.patientLink.findUnique({ where: { id: link.id } })).toBeNull()
  })
})
