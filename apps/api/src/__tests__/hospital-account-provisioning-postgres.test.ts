import { randomBytes, randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { hashAuthToken } from "@/lib/auth-email-tokens"

vi.mock("server-only", () => ({}))

const runPostgres = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"

describe.skipIf(!runPostgres)("Hospital account provisioning in PostgreSQL", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let createHospitalAccount: typeof import("@/lib/hospital/account-provisioning").createHospitalAccount
  let reissueHospitalActivation: typeof import("@/lib/hospital/account-provisioning").reissueHospitalActivation
  let issueHospitalRecovery: typeof import("@/lib/hospital/account-provisioning").issueHospitalRecovery
  let consumeHospitalAccountToken: typeof import("@/lib/hospital/account-provisioning").consumeHospitalAccountToken
  let statusAuditId: string

  const suffix = randomUUID()
  const institutionId = `account-control-institution-${suffix}`
  const userIds: string[] = []

  beforeAll(async () => {
    ;({ prisma } = await import("@/lib/prisma"))
    ;({
      createHospitalAccount,
      reissueHospitalActivation,
      issueHospitalRecovery,
      consumeHospitalAccountToken,
      STATUS_OPERATOR_AUDIT_ID: statusAuditId,
    } = await import("@/lib/hospital/account-provisioning"))
    await prisma.institution.create({
      data: { id: institutionId, name: "Account control test", city: "Test" },
    })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.auditLog.deleteMany({
      where: { OR: [{ userId: statusAuditId }, { entityId: { in: userIds } }] },
    })
    await prisma.hospitalUsernameReservation.deleteMany({
      where: { userId: { in: userIds } },
    })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.institution.deleteMany({ where: { id: institutionId } })
    await prisma.$disconnect()
  })

  it("hashes, invalidates, and atomically consumes a 72-hour activation link", async () => {
    const firstToken = randomBytes(32).toString("base64url")
    const created = await createHospitalAccount(prisma, {
      username: `Activation.${suffix.replaceAll("-", "").slice(0, 16)}`,
      email: `activation-${suffix}@example.test`,
      firstName: "Activation",
      lastName: "Test",
      title: "Dr",
      institutionId,
      accessProfile: "CLINICAL_MEMBER",
      locale: "bg",
    }, { tokenFactory: () => firstToken })
    userIds.push(created.user.id)

    const storedFirst = await prisma.hospitalAccountAccessToken.findFirstOrThrow({
      where: { userId: created.user.id, purpose: "ACTIVATION" },
    })
    expect(storedFirst.tokenHash).not.toBe(firstToken)
    expect(storedFirst.expiresAt.getTime() - storedFirst.createdAt.getTime())
      .toBe(72 * 60 * 60 * 1000)

    const secondToken = randomBytes(32).toString("base64url")
    const replacement = await reissueHospitalActivation(prisma, created.user.id, {
      tokenFactory: () => secondToken,
    })
    expect(replacement.token).toBe(secondToken)
    expect((await prisma.hospitalAccountAccessToken.findUniqueOrThrow({
      where: { id: storedFirst.id },
    })).invalidatedAt).not.toBeNull()
    await expect(consumeHospitalAccountToken(
      prisma, firstToken, "ActivatedStrong1!",
    )).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_ACCOUNT_LINK" })

    const concurrentTokens = [
      randomBytes(32).toString("base64url"),
      randomBytes(32).toString("base64url"),
    ]
    await Promise.all(concurrentTokens.map(token => reissueHospitalActivation(
      prisma,
      created.user.id,
      { tokenFactory: () => token },
    )))
    const activeLinks = await prisma.hospitalAccountAccessToken.findMany({
      where: {
        userId: created.user.id,
        purpose: "ACTIVATION",
        consumedAt: null,
        invalidatedAt: null,
      },
    })
    expect(activeLinks).toHaveLength(1)
    const activeToken = concurrentTokens.find(token =>
      hashAuthToken(token) === activeLinks[0]?.tokenHash)
    expect(activeToken).toBeDefined()
    await expect(consumeHospitalAccountToken(
      prisma, secondToken, "ActivatedStrong1!",
    )).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_ACCOUNT_LINK" })

    const attempts = await Promise.allSettled([
      consumeHospitalAccountToken(prisma, activeToken!, "ActivatedStrong1!"),
      consumeHospitalAccountToken(prisma, activeToken!, "ActivatedStrong1!"),
    ])
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id } })
    expect(user.activatedAt).not.toBeNull()
    expect(user.emailVerifiedAt).toBeNull()
    expect(await bcrypt.compare("ActivatedStrong1!", user.passwordHash)).toBe(true)
    expect(await prisma.auditLog.count({
      where: { entityId: user.id, action: "HOSPITAL_ACCOUNT_ACTIVATED" },
    })).toBe(1)

    const audits = await prisma.auditLog.findMany({ where: { entityId: user.id } })
    const serialized = JSON.stringify(audits)
    expect(serialized).not.toContain(firstToken)
    expect(serialized).not.toContain(secondToken)
    expect(serialized).not.toContain(activeToken)
    expect(serialized).not.toContain(storedFirst.tokenHash)
  })

  it("issues an eight-hour recovery link and revokes it on first use", async () => {
    const userId = userIds[0]!
    const recoveryToken = randomBytes(32).toString("base64url")
    const issued = await issueHospitalRecovery(prisma, userId, {
      tokenFactory: () => recoveryToken,
    })
    const stored = await prisma.hospitalAccountAccessToken.findFirstOrThrow({
      where: { userId, purpose: "RECOVERY", invalidatedAt: null },
      orderBy: { createdAt: "desc" },
    })
    expect(issued.expiresAt.getTime() - stored.createdAt.getTime())
      .toBe(8 * 60 * 60 * 1000)

    await expect(consumeHospitalAccountToken(
      prisma, recoveryToken, "RecoveredStrong1!",
    )).resolves.toMatchObject({ matched: true, purpose: "RECOVERY" })
    await expect(consumeHospitalAccountToken(
      prisma, recoveryToken, "DifferentStrong1!",
    )).rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_ACCOUNT_LINK" })

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(await bcrypt.compare("RecoveredStrong1!", user.passwordHash)).toBe(true)
    expect(await prisma.auditLog.count({
      where: { entityId: userId, action: "HOSPITAL_ACCOUNT_RECOVERY_CONSUMED" },
    })).toBe(1)
  })

  it("resolves differently-cased concurrent username claims to one account and one reservation", async () => {
    const stem = `Concurrent.${suffix.replaceAll("-", "").slice(0, 16)}`
    const create = (username: string) => createHospitalAccount(prisma, {
      username,
      email: null,
      firstName: "Concurrent",
      lastName: "Test",
      title: "",
      institutionId,
      accessProfile: "CLINICAL_MEMBER",
      locale: "bg",
    })
    const attempts = await Promise.allSettled([
      create(stem),
      create(stem.toUpperCase()),
    ])
    const fulfilled = attempts.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof create>>> =>
        result.status === "fulfilled",
    )
    expect(fulfilled).toHaveLength(1)
    userIds.push(fulfilled[0]!.value.user.id)
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1)
    expect(await prisma.user.count({
      where: { usernameCanonical: stem.toLowerCase() },
    })).toBe(1)
    expect(await prisma.hospitalUsernameReservation.count({
      where: { usernameCanonical: stem.toLowerCase(), releasedAt: null },
    })).toBe(1)
  })
})
