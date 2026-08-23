import { afterEach, describe, expect, it } from "vitest"
import { AuthService } from "./auth.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"

const databases: StatusDatabase[] = []

function setup() {
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  let now = Date.parse("2026-08-22T12:00:00.000Z")
  const auth = new AuthService(
    db,
    Buffer.alloc(32, 3),
    4,
    () => now,
    undefined,
    Buffer.alloc(32, 9),
  )
  return {
    db,
    auth,
    now: () => now,
    advance: (milliseconds: number) => { now += milliseconds },
  }
}

afterEach(() => {
  while (databases.length) databases.pop()?.close()
})

async function firstEnrollment(auth: AuthService, now: number, address = "10.0.0.1") {
  await auth.initialize("admin@hospital.test", "Initial password phrase1!")
  const challenge = await auth.beginPasswordLogin({
    email: "admin@hospital.test",
    password: "Initial password phrase1!",
    clientAddress: address,
  })
  if (!challenge.manualKey) throw new Error("Expected an enrollment seed")
  const result = auth.completeMfaLogin({
    challengeToken: challenge.challengeToken,
    code: totpCode(challenge.manualKey, now),
    clientAddress: address,
  })
  return { challenge, result, secret: challenge.manualKey }
}

describe("mandatory Status operator MFA", () => {
  it("creates no session after password verification and shows recovery codes once", async () => {
    const { auth, db, now } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const challenge = await auth.beginPasswordLogin({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.1",
    })
    expect(challenge.enrollmentRequired).toBe(true)
    expect(challenge.manualKey).toMatch(/^[A-Z2-7]{32}$/)
    expect(challenge.otpauthUri).toMatch(/^otpauth:\/\/totp\//)
    expect(auth.validateSession(challenge.challengeToken)).toBe(false)
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number }).count).toBe(0)

    const result = auth.completeMfaLogin({
      challengeToken: challenge.challengeToken,
      code: totpCode(challenge.manualKey!, now()),
      clientAddress: "10.0.0.1",
    })
    expect(result.recoveryCodes).toHaveLength(10)
    expect(auth.validateSession(result.sessionToken)).toBe(true)
    const stored = JSON.stringify({
      state: db.sqlite.prepare("SELECT * FROM status_admin_mfa_state").all(),
      codes: db.sqlite.prepare("SELECT * FROM status_admin_mfa_recovery_codes").all(),
    })
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM status_admin_mfa_recovery_codes").get() as { count: number }).count).toBe(10)
    expect(stored).not.toContain(challenge.manualKey)
    for (const code of result.recoveryCodes!) expect(stored).not.toContain(code)
    expect(() => auth.completeMfaLogin({
      challengeToken: challenge.challengeToken,
      code: totpCode(challenge.manualKey!, now()),
      clientAddress: "10.0.0.2",
    })).toThrowError(expect.objectContaining({ code: "MFA_CHALLENGE_INVALID" }))
  })

  it("rejects replay of an accepted TOTP step and accepts the next step", async () => {
    const { auth, now, advance } = setup()
    const enrolled = await firstEnrollment(auth, now())
    const replayChallenge = await auth.beginPasswordLogin({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.2",
    })
    expect(replayChallenge.enrollmentRequired).toBe(false)
    expect(() => auth.completeMfaLogin({
      challengeToken: replayChallenge.challengeToken,
      code: totpCode(enrolled.secret, now()),
      clientAddress: "10.0.0.2",
    })).toThrowError(expect.objectContaining({ code: "INVALID_CREDENTIALS" }))

    advance(30_000)
    const nextChallenge = await auth.beginPasswordLogin({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.3",
    })
    const login = auth.completeMfaLogin({
      challengeToken: nextChallenge.challengeToken,
      code: totpCode(enrolled.secret, now()),
      clientAddress: "10.0.0.3",
    })
    expect(auth.validateSession(login.sessionToken)).toBe(true)
    expect(login.recoveryCodes).toBeUndefined()
  })

  it("consumes every recovery code at most once", async () => {
    const { auth, now } = setup()
    const enrolled = await firstEnrollment(auth, now())
    const recoveryCode = enrolled.result.recoveryCodes![0]!
    const first = await auth.beginPasswordLogin({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.4",
    })
    expect(auth.completeMfaLogin({
      challengeToken: first.challengeToken,
      code: recoveryCode.toLowerCase(),
      clientAddress: "10.0.0.4",
    }).kind).toBe("password")
    const second = await auth.beginPasswordLogin({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.5",
    })
    expect(() => auth.completeMfaLogin({
      challengeToken: second.challengeToken,
      code: recoveryCode,
      clientAddress: "10.0.0.5",
    })).toThrowError(expect.objectContaining({ code: "INVALID_CREDENTIALS" }))
  })

  it("expires challenges after five minutes and rate-limits code guesses", async () => {
    const { auth, now, advance } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const expired = await auth.beginPasswordLogin({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.6",
    })
    advance(5 * 60_000 + 1)
    expect(() => auth.completeMfaLogin({
      challengeToken: expired.challengeToken,
      code: totpCode(expired.manualKey!, now()),
      clientAddress: "10.0.0.6",
    })).toThrowError(expect.objectContaining({ code: "MFA_CHALLENGE_INVALID" }))

    const active = await auth.beginPasswordLogin({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.7",
    })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => auth.completeMfaLogin({
        challengeToken: active.challengeToken,
        code: "invalid",
        clientAddress: "10.0.0.7",
      })).toThrowError(expect.objectContaining({ code: "INVALID_CREDENTIALS" }))
    }
    expect(() => auth.completeMfaLogin({
      challengeToken: active.challengeToken,
      code: totpCode(active.manualKey!, now()),
      clientAddress: "10.0.0.7",
    })).toThrowError(expect.objectContaining({ code: "RATE_LIMITED" }))
  })

  it("requires fresh enrollment after a credential generation commits", async () => {
    const { auth, now } = setup()
    const enrolled = await firstEnrollment(auth, now())
    const pending = await auth.prepare({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
    })
    expect(auth.commit(pending.transactionId)).toEqual({ generation: 2 })
    expect(auth.validateSession(enrolled.result.sessionToken)).toBe(false)
    const challenge = await auth.beginPasswordLogin({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
      clientAddress: "10.0.0.8",
    })
    expect(challenge.enrollmentRequired).toBe(true)
    expect(challenge.manualKey).toMatch(/^[A-Z2-7]{32}$/)
    expect((auth.completeMfaLogin({
      challengeToken: challenge.challengeToken,
      code: totpCode(challenge.manualKey!, now()),
      clientAddress: "10.0.0.8",
    }).recoveryCodes)).toHaveLength(10)
  })
})
