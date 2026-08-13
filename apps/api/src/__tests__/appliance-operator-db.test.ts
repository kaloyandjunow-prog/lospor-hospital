import bcrypt from "bcryptjs"
import { beforeEach, describe, expect, it } from "vitest"
import type { PrismaClient } from "../generated/prisma/client"
import { applyApplianceOperatorCredential } from "../../scripts/lib/appliance-operator-db"

type FakeUser = {
  id: string
  email: string
  role: "ADMIN" | "MEMBER"
  deletedAt: Date | null
  passwordHash: string
  passwordChangedAt: Date | null
}

function fakeDatabase(users: FakeUser[]) {
  let installation: {
    applianceOperatorUserId: string | null
    operatorCredentialGeneration: number
  } | null = null

  const db = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        users.find(user => user.email === where.email) ?? null,
      update: async ({ where, data }: {
        where: { id: string }
        data: { passwordHash: string; passwordChangedAt: Date }
      }) => {
        const user = users.find(candidate => candidate.id === where.id)
        if (!user) throw new Error("missing user")
        Object.assign(user, data)
        return user
      },
    },
    passwordResetToken: {
      updateMany: async () => ({ count: 0 }),
    },
    hospitalInstallation: {
      findUnique: async () => installation,
      upsert: async ({ create, update }: {
        create: { applianceOperatorUserId: string; operatorCredentialGeneration: number }
        update: { applianceOperatorUserId: string; operatorCredentialGeneration: number }
      }) => {
        installation = installation ? { ...installation, ...update } : { ...create }
        return installation
      },
    },
  }
  const transactional = Object.assign(db, {
    $transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
  })

  return {
    prisma: transactional as unknown as PrismaClient,
    installation: () => installation,
  }
}

describe("appliance operator database command", () => {
  let first: FakeUser
  let second: FakeUser

  beforeEach(async () => {
    first = {
      id: "admin-one",
      email: "operator@example.test",
      role: "ADMIN",
      deletedAt: null,
      passwordHash: await bcrypt.hash("Old!Pass1", 4),
      passwordChangedAt: null,
    }
    second = {
      id: "admin-two",
      email: "next@example.test",
      role: "ADMIN",
      deletedAt: null,
      passwordHash: await bcrypt.hash("Other!Pass1", 4),
      passwordChangedAt: null,
    }
  })

  it("initializes the operator and generation transactionally", async () => {
    const fixture = fakeDatabase([first, second])
    const result = await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: " Operator@Example.Test ",
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })

    expect(result).toEqual({
      operation: "initialize",
      credentialGeneration: 1,
      alreadyApplied: false,
    })
    expect(fixture.installation()).toMatchObject({
      applianceOperatorUserId: "admin-one",
      operatorCredentialGeneration: 1,
    })
    expect(await bcrypt.compare("Fresh!Pass1", first.passwordHash)).toBe(true)
    expect(first.passwordChangedAt).toBeInstanceOf(Date)
  })

  it("treats an exact same-generation replay as a safe no-op", async () => {
    const fixture = fakeDatabase([first])
    await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })
    const changedAt = first.passwordChangedAt

    const replay = await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })
    expect(replay.alreadyApplied).toBe(true)
    expect(first.passwordChangedAt).toBe(changedAt)
  })

  it("rejects reuse of a generation with a different password", async () => {
    const fixture = fakeDatabase([first])
    await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })
    await expect(applyApplianceOperatorCredential(fixture.prisma, {
      operation: "rotate",
      email: first.email,
      password: "Different!Pass2",
      credentialGeneration: 1,
    })).rejects.toThrow("CREDENTIAL_GENERATION_ALREADY_USED")
  })

  it("transfers only to a different active administrator at the next generation", async () => {
    const fixture = fakeDatabase([first, second])
    await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })
    await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "transfer",
      email: second.email,
      password: "Transfer!Pass2",
      credentialGeneration: 2,
    })
    expect(fixture.installation()).toMatchObject({
      applianceOperatorUserId: "admin-two",
      operatorCredentialGeneration: 2,
    })
    expect(await bcrypt.compare("Transfer!Pass2", second.passwordHash)).toBe(true)
  })

  it("reconciles a restored older database directly to a newer pending generation", async () => {
    const fixture = fakeDatabase([first, second])
    await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })

    const result = await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "reconcile",
      email: second.email,
      password: "Restored!Pass9",
      credentialGeneration: 9,
    })

    expect(result).toMatchObject({
      operation: "reconcile",
      credentialGeneration: 9,
      alreadyApplied: false,
    })
    expect(fixture.installation()).toMatchObject({
      applianceOperatorUserId: second.id,
      operatorCredentialGeneration: 9,
    })
    expect(await bcrypt.compare("Restored!Pass9", second.passwordHash)).toBe(true)
  })

  it("rejects reconcile when the restored database has no operator linkage", async () => {
    const fixture = fakeDatabase([first])
    await expect(applyApplianceOperatorCredential(fixture.prisma, {
      operation: "reconcile",
      email: first.email,
      password: "Restored!Pass9",
      credentialGeneration: 9,
    })).rejects.toThrow("RECONCILE_REQUIRES_EXISTING_APPLIANCE_OPERATOR")
  })

  it("rejects reconcile to the same generation with a different password", async () => {
    const fixture = fakeDatabase([first])
    await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })
    await expect(applyApplianceOperatorCredential(fixture.prisma, {
      operation: "reconcile",
      email: first.email,
      password: "Different!Pass2",
      credentialGeneration: 1,
    })).rejects.toThrow("CREDENTIAL_GENERATION_ALREADY_USED")
  })

  it("rejects reconcile to an older generation", async () => {
    const fixture = fakeDatabase([first])
    await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })
    await expect(applyApplianceOperatorCredential(fixture.prisma, {
      operation: "reconcile",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 0,
    })).rejects.toThrow("CREDENTIAL_GENERATION_CANNOT_GO_BACKWARDS")
  })

  it("rejects reconcile when the selected post-restore operator is absent", async () => {
    const fixture = fakeDatabase([first])
    await applyApplianceOperatorCredential(fixture.prisma, {
      operation: "initialize",
      email: first.email,
      password: "Fresh!Pass1",
      credentialGeneration: 1,
    })
    await expect(applyApplianceOperatorCredential(fixture.prisma, {
      operation: "reconcile",
      email: "absent@example.test",
      password: "Restored!Pass9",
      credentialGeneration: 9,
    })).rejects.toThrow("APPLIANCE_OPERATOR_MUST_BE_ACTIVE_ADMIN")
    expect(fixture.installation()).toMatchObject({
      applianceOperatorUserId: first.id,
      operatorCredentialGeneration: 1,
    })
  })
})
