import { describe, expect, it, vi } from "vitest"
import { AccountControlClient } from "./account-control.js"

const ACCOUNT = {
  id: "user-1",
  username: "Dr.Iva",
  email: "doctor@example.test",
  name: "д-р Ива Петрова",
  role: "MEMBER",
  accountKind: "CLINICAL",
  locale: "bg",
  institutionId: "inst-1",
  institutionName: "УМБАЛ Тест",
  state: "PENDING_ACTIVATION",
  designatedApplianceOperator: false,
  activeActivationExpiresAt: "2026-08-25T12:00:00.000Z",
  activeRecoveryExpiresAt: null,
  createdAt: "2026-08-22T12:00:00.000Z",
}
const LINK = {
  purpose: "ACTIVATION",
  url: `https://clinical.hospital.test/reset-password#hospitalToken=${"A".repeat(43)}`,
  expiresAt: "2026-08-25T12:00:00.000Z",
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("Status account-control client", () => {
  it("authenticates to the private API and accepts only the bounded safe directory contract", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response({
      accounts: [ACCOUNT],
      institutions: [{ id: "inst-1", name: "УМБАЛ Тест", city: "София", canHaveHeadOfDepartment: true }],
    }))
    const client = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts",
      "s".repeat(32),
      1000,
      fetcher,
    )
    await expect(client.list()).resolves.toMatchObject({ accounts: [ACCOUNT] })
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:3002/v1/internal/hospital/accounts",
      expect.objectContaining({ headers: { authorization: `Bearer ${"s".repeat(32)}` } }),
    )
  })

  it("rejects malformed usernames and accepts an absent contact email", async () => {
    const base = {
      accounts: [{ ...ACCOUNT, email: null }],
      institutions: [{ id: "inst-1", name: "УМБАЛ Тест", city: "София", canHaveHeadOfDepartment: true }],
    }
    const valid = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts",
      "s".repeat(32),
      1000,
      vi.fn(async () => response(base)),
    )
    await expect(valid.list()).resolves.toMatchObject({
      accounts: [{ username: "Dr.Iva", email: null }],
    })

    const invalid = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts",
      "s".repeat(32),
      1000,
      vi.fn(async () => response({
        ...base,
        accounts: [{ ...ACCOUNT, username: "Doctor Name" }],
      })),
    )
    await expect(invalid.list()).rejects.toMatchObject({
      code: "ACCOUNT_CONTROL_INVALID_RESPONSE",
    })
  })

  it("never places the private bearer in an error and keeps stable API codes", async () => {
    const secret = "secret-bearer-value-never-return"
    const client = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts",
      secret,
      1000,
      vi.fn(async () => response({ code: "EMAIL_ALREADY_REGISTERED", echoed: secret }, 409)),
    )
    await expect(client.list()).rejects.toMatchObject({ code: "EMAIL_ALREADY_REGISTERED" })
    await expect(client.list()).rejects.not.toThrow(secret)
  })

  it("rejects a one-time link if its secret appears in the query string", async () => {
    const unsafe = {
      ...LINK,
      url: `https://clinical.hospital.test/reset-password?token=${"A".repeat(43)}`,
    }
    const client = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts",
      "s".repeat(32),
      1000,
      vi.fn(async () => response({ account: ACCOUNT, oneTimeLink: unsafe }, 201)),
    )
    await expect(client.create({
      username: ACCOUNT.username,
      email: ACCOUNT.email,
      firstName: "Ива",
      lastName: "Петрова",
      title: "д-р",
      institutionId: "inst-1",
      accessProfile: "CLINICAL_MEMBER",
      locale: "bg",
    })).rejects.toMatchObject({ code: "ACCOUNT_CONTROL_INVALID_RESPONSE" })
  })

  it("parses an activation link and percent-encodes account ids on reissue", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response({ oneTimeLink: LINK }))
    const client = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts/",
      "s".repeat(32),
      1000,
      fetcher,
    )
    await expect(client.reissueActivation("user/one")).resolves.toEqual(LINK)
    expect(fetcher.mock.calls[0]?.[0]).toContain("/user%2Fone/activation")
  })

  it("uses PATCH for reasoned clinical-role changes and validates the bounded result", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response({
      account: { id: "user-1", role: "ADMIN" },
      previousRole: "MEMBER",
      changed: true,
      invalidatedLinks: 2,
    }))
    const client = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts",
      "s".repeat(32),
      1000,
      fetcher,
    )
    await expect(client.changeRole("user/one", "ADMIN", "Approved by hospital IT"))
      .resolves.toMatchObject({ account: { role: "ADMIN" }, changed: true })
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:3002/v1/internal/hospital/accounts/user%2Fone/role",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "ADMIN", reason: "Approved by hospital IT" }),
      }),
    )
  })

  it("validates username-change recovery links and never accepts query secrets", async () => {
    const fetcher = vi.fn(async () => response({
      account: { id: "user-1", username: "Dr.New_Name" },
      oneTimeLink: { ...LINK, purpose: "RECOVERY" },
    }))
    const client = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts",
      "s".repeat(32),
      1000,
      fetcher,
    )
    await expect(client.changeUsername(
      "user-1",
      "Dr.New_Name",
      "Requested by the account holder",
    )).resolves.toMatchObject({
      account: { username: "Dr.New_Name" },
      oneTimeLink: { purpose: "RECOVERY" },
    })

    const unsafe = new AccountControlClient(
      "http://api:3002/v1/internal/hospital/accounts",
      "s".repeat(32),
      1000,
      vi.fn(async () => response({
        account: { id: "user-1", username: "Dr.New_Name" },
        oneTimeLink: {
          ...LINK,
          purpose: "RECOVERY",
          url: `https://clinical.test/reset-password?hospitalToken=${"A".repeat(43)}`,
        },
      })),
    )
    await expect(unsafe.changeUsername(
      "user-1",
      "Dr.New_Name",
      "Requested by the account holder",
    )).rejects.toMatchObject({ code: "ACCOUNT_CONTROL_INVALID_RESPONSE" })
  })
})
