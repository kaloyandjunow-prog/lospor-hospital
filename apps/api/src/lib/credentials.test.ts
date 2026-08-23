import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), compare: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }))
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }))

import { verifyCredentials } from "./credentials"

const hospitalAccount = {
  id: "user-1",
  email: "contact@example.test",
  username: "Clinician.One",
  usernameCanonical: "clinician.one",
  passwordHash: "hash",
  activatedAt: new Date(),
  emailVerifiedAt: null,
  deletedAt: null,
  institution: null,
}

describe("deployment-bound credential lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue(hospitalAccount)
    mocks.compare.mockResolvedValue(true)
  })

  it("looks up a Hospital identity only by canonical username", async () => {
    await expect(verifyCredentials({ kind: "USERNAME", canonical: "clinician.one" }, "secret"))
      .resolves.toBe(hospitalAccount)
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { usernameCanonical: "clinician.one" },
    }))
  })

  it("never treats a Hospital contact email as a public login fallback", async () => {
    await expect(verifyCredentials({ kind: "EMAIL", canonical: "contact@example.test" }, "secret"))
      .resolves.toBeNull()
  })

  it.each([
    ["inactive", { activatedAt: null }],
    ["deleted", { deletedAt: new Date() }],
  ])("rejects a valid password for an %s Hospital account", async (_name, state) => {
    mocks.findUnique.mockResolvedValue({ ...hospitalAccount, ...state })
    await expect(verifyCredentials({ kind: "USERNAME", canonical: "clinician.one" }, "secret"))
      .resolves.toBeNull()
  })

  it("preserves public email verification for accounts without usernames", async () => {
    const publicAccount = {
      ...hospitalAccount,
      username: null,
      usernameCanonical: null,
      activatedAt: null,
      emailVerifiedAt: new Date(),
    }
    mocks.findUnique.mockResolvedValue(publicAccount)
    await expect(verifyCredentials({ kind: "EMAIL", canonical: "contact@example.test" }, "secret"))
      .resolves.toBe(publicAccount)
  })
})
