import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import { hashAuthToken } from "@/lib/auth-email-tokens"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/password-epoch", () => ({ notePasswordChanged: vi.fn() }))

const NOW = new Date("2026-08-22T12:00:00.000Z")
const TOKEN = "A".repeat(43)

// HAUD_ROLLBACK:hospital-account-provisioning

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    institution: {
      findUnique: vi.fn().mockResolvedValue({ id: "inst-1", name: "УМБАЛ Тест" }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "user-1",
        username: "Dr.Iva",
        email: "doctor@example.test",
        name: "д-р Ива Петрова",
        role: "MEMBER",
        accountKind: "CLINICAL",
        institutionId: "inst-1",
        createdAt: NOW,
      }),
      update: vi.fn().mockResolvedValue({ id: "user-1" }),
    },
    hospitalAccountAccessToken: {
      create: vi.fn().mockResolvedValue({ id: "link-1" }),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    hospitalUsernameReservation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "username-reservation-1" }),
    },
    hospitalInstallation: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    passwordResetToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  }
  const prisma = {
    hospitalAccountAccessToken: {
      findUnique: vi.fn().mockResolvedValue({ id: "link-1" }),
    },
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaClient
  return { prisma, tx }
}

describe("Hospital account provisioning", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    "ab",
    "1Doctor",
    "Doctor Name",
    "Doctor@Hospital",
    "Doctor/One",
    "Doctor\\One",
    "Доктор",
  ])("rejects invalid username %j before opening a transaction", async username => {
    const { prisma } = setup()
    const { createHospitalAccount } = await import("./account-provisioning")
    await expect(createHospitalAccount(prisma, {
      username,
      email: null,
      firstName: "Ива",
      lastName: "Петрова",
      title: "",
      institutionId: "inst-1",
      accessProfile: "CLINICAL_MEMBER",
      locale: "bg",
    })).rejects.toBeDefined()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("creates an inactive clinical account and stores only the activation digest", async () => {
    const { prisma, tx } = setup()
    const { createHospitalAccount, HOSPITAL_ACTIVATION_TTL_MS } = await import("./account-provisioning")
    const result = await createHospitalAccount(prisma, {
      username: "Dr.Iva",
      email: " Doctor@Example.Test ",
      firstName: "Ива",
      lastName: "Петрова",
      title: "д-р",
      institutionId: "inst-1",
      accessProfile: "CLINICAL_MEMBER",
      locale: "bg",
    }, { now: NOW, tokenFactory: () => TOKEN })

    expect(result.token).toBe(TOKEN)
    expect(result.expiresAt.getTime() - NOW.getTime()).toBe(HOSPITAL_ACTIVATION_TTL_MS)
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: "doctor@example.test",
        username: "Dr.Iva",
        usernameCanonical: "dr.iva",
        role: "MEMBER",
        accountKind: "CLINICAL",
        emailVerifiedAt: null,
        approvedAt: NOW,
        preferences: { ui: { locale: "bg" } },
        passwordHash: expect.any(String),
      }),
    }))
    expect(tx.hospitalAccountAccessToken.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        purpose: "ACTIVATION",
        tokenHash: hashAuthToken(TOKEN),
        expiresAt: result.expiresAt,
        createdAt: NOW,
      },
    })
    expect(tx.hospitalUsernameReservation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        usernameCanonical: "dr.iva",
        createdAt: NOW,
      },
    })
    const auditPayload = JSON.stringify(tx.auditLog.create.mock.calls)
    expect(auditPayload).not.toContain(TOKEN)
    expect(auditPayload).not.toContain(hashAuthToken(TOKEN))
  })

  it("creates a case-preserving username account without a contact email", async () => {
    const { prisma, tx } = setup()
    const { createHospitalAccount } = await import("./account-provisioning")
    await createHospitalAccount(prisma, {
      username: "Clinician.One",
      email: null,
      firstName: "Ива",
      lastName: "Петрова",
      title: "д-р",
      institutionId: "inst-1",
      accessProfile: "CLINICAL_MEMBER",
      locale: "bg",
    }, { now: NOW, tokenFactory: () => TOKEN })
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        username: "Clinician.One",
        usernameCanonical: "clinician.one",
        email: null,
        activatedAt: null,
        emailVerifiedAt: null,
      }),
    }))
  })

  it("propagates an audit failure through the account-creation transaction", async () => {
    const { prisma, tx } = setup()
    tx.auditLog.create.mockRejectedValueOnce(new Error("audit unavailable"))
    const { createHospitalAccount } = await import("./account-provisioning")

    await expect(createHospitalAccount(prisma, {
      username: "Dr.Iva",
      email: "doctor@example.test",
      firstName: "Ива",
      lastName: "Петрова",
      title: "д-р",
      institutionId: "inst-1",
      accessProfile: "CLINICAL_MEMBER",
      locale: "bg",
    }, { now: NOW, tokenFactory: () => TOKEN })).rejects.toThrow("audit unavailable")
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledOnce()
  })

  it("uses the compatibility role but persists RESEARCH_ONLY as the account authority", async () => {
    const { prisma, tx } = setup()
    tx.user.create.mockResolvedValue({
      id: "research-1",
      username: "Research1",
      email: "research@example.test",
      name: "Research User",
      role: "RESEARCHER",
      accountKind: "RESEARCH_ONLY",
      institutionId: "inst-1",
      createdAt: NOW,
    })
    const { createHospitalAccount } = await import("./account-provisioning")
    await createHospitalAccount(prisma, {
      username: "Research1",
      email: "research@example.test",
      firstName: "Research",
      lastName: "User",
      title: "",
      institutionId: "inst-1",
      accessProfile: "RESEARCH_ONLY",
      locale: "en",
    }, { now: NOW, tokenFactory: () => TOKEN })
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: "RESEARCHER", accountKind: "RESEARCH_ONLY" }),
    }))
  })

  it("refuses to create a head for the non-department institution", async () => {
    const { prisma, tx } = setup()
    tx.institution.findUnique.mockResolvedValue({ id: "no-institution", name: "Без институция" })
    const { createHospitalAccount } = await import("./account-provisioning")
    await expect(createHospitalAccount(prisma, {
      username: "Head.Doctor",
      email: "hod@example.test",
      firstName: "Head",
      lastName: "Doctor",
      title: "",
      institutionId: "no-institution",
      accessProfile: "CLINICAL_HOD",
      locale: "bg",
    }, { now: NOW, tokenFactory: () => TOKEN })).rejects.toMatchObject({
      code: "INSTITUTION_CANNOT_HAVE_HOD",
    })
    expect(tx.user.create).not.toHaveBeenCalled()
  })

  it("reissue invalidates every prior activation link and audits no secret", async () => {
    const { prisma, tx } = setup()
    tx.user.findUnique.mockResolvedValue({
      id: "user-1",
      role: "MEMBER",
      accountKind: "CLINICAL",
      activatedAt: null,
      deletedAt: null,
    })
    tx.hospitalAccountAccessToken.updateMany.mockResolvedValue({ count: 2 })
    const { reissueHospitalActivation, HOSPITAL_ACTIVATION_TTL_MS } = await import("./account-provisioning")
    const result = await reissueHospitalActivation(prisma, "user-1", {
      now: NOW,
      tokenFactory: () => TOKEN,
    })
    expect(result.expiresAt.getTime() - NOW.getTime()).toBe(HOSPITAL_ACTIVATION_TTL_MS)
    expect(tx.hospitalAccountAccessToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", purpose: "ACTIVATION" }),
      data: { invalidatedAt: NOW },
    }))
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "HOSPITAL_ACCOUNT_ACTIVATION_REISSUED",
        detail: expect.objectContaining({ priorLinksInvalidated: 2 }),
      }),
    }))
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(TOKEN)
  })

  it("issues an eight-hour recovery link but never for the designated appliance operator", async () => {
    const { prisma, tx } = setup()
    tx.user.findUnique.mockResolvedValue({
      id: "user-1",
      role: "MEMBER",
      accountKind: "CLINICAL",
      activatedAt: NOW,
      deletedAt: null,
    })
    const { issueHospitalRecovery, HOSPITAL_RECOVERY_TTL_MS } = await import("./account-provisioning")
    const result = await issueHospitalRecovery(prisma, "user-1", {
      now: NOW,
      tokenFactory: () => TOKEN,
    })
    expect(result.expiresAt.getTime() - NOW.getTime()).toBe(HOSPITAL_RECOVERY_TTL_MS)

    tx.hospitalInstallation.findFirst.mockResolvedValue({ id: "local" })
    await expect(issueHospitalRecovery(prisma, "user-1", {
      now: NOW,
      tokenFactory: () => TOKEN,
    })).rejects.toMatchObject({ code: "APPLIANCE_OPERATOR_MANAGED" })
  })

  it("never issues account links for administrative authority", async () => {
    const { prisma, tx } = setup()
    tx.user.findUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      accountKind: "CLINICAL",
      activatedAt: NOW,
      deletedAt: null,
    })
    const { issueHospitalRecovery } = await import("./account-provisioning")

    await expect(issueHospitalRecovery(prisma, "admin-1", {
      now: NOW,
      tokenFactory: () => TOKEN,
    })).rejects.toMatchObject({ code: "ACCOUNT_AUTHORITY_PROTECTED" })
    expect(tx.hospitalAccountAccessToken.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it("atomically consumes activation once, activates the user, and writes its audit in the transaction", async () => {
    const { prisma, tx } = setup()
    tx.hospitalAccountAccessToken.findUnique.mockResolvedValue({
      id: "link-1",
      userId: "user-1",
      purpose: "ACTIVATION",
      consumedAt: null,
      invalidatedAt: null,
      expiresAt: new Date(NOW.getTime() + 60_000),
      user: {
        id: "user-1",
        role: "MEMBER",
        accountKind: "CLINICAL",
        activatedAt: null,
        deletedAt: null,
      },
    })
    const { consumeHospitalAccountToken } = await import("./account-provisioning")
    await expect(consumeHospitalAccountToken(prisma, TOKEN, "NewStrong1!", NOW))
      .resolves.toEqual({ matched: true, purpose: "ACTIVATION", userId: "user-1" })
    expect(tx.hospitalAccountAccessToken.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ id: "link-1", consumedAt: null, invalidatedAt: null }),
      data: { consumedAt: NOW },
    }))
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({ activatedAt: NOW, passwordChangedAt: NOW }),
    }))
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        action: "HOSPITAL_ACCOUNT_ACTIVATED",
        entityId: "user-1",
        detail: { linkPurposeCode: "ACTIVATION" },
      },
    })
  })

  it("rejects an unknown account token before opening a write transaction", async () => {
    const { prisma } = setup()
    vi.mocked(prisma.hospitalAccountAccessToken.findUnique).mockResolvedValue(null)
    const { consumeHospitalAccountToken } = await import("./account-provisioning")

    await expect(consumeHospitalAccountToken(prisma, TOKEN, "NewStrong1!", NOW))
      .resolves.toEqual({ matched: false })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("changes nothing when another request won the atomic token claim", async () => {
    const { prisma, tx } = setup()
    tx.hospitalAccountAccessToken.findUnique.mockResolvedValue({
      id: "link-1",
      userId: "user-1",
      purpose: "RECOVERY",
      consumedAt: null,
      invalidatedAt: null,
      expiresAt: new Date(NOW.getTime() + 60_000),
      user: {
        id: "user-1",
        role: "MEMBER",
        accountKind: "CLINICAL",
        activatedAt: NOW,
        deletedAt: null,
      },
    })
    tx.hospitalAccountAccessToken.updateMany.mockResolvedValueOnce({ count: 0 })
    const { consumeHospitalAccountToken } = await import("./account-provisioning")
    await expect(consumeHospitalAccountToken(prisma, TOKEN, "NewStrong1!", NOW))
      .rejects.toMatchObject({ code: "INVALID_OR_EXPIRED_ACCOUNT_LINK" })
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})
