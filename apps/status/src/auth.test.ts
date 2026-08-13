import { afterEach, describe, expect, it } from "vitest"
import bcrypt from "bcryptjs"
import { AuthError, AuthService } from "./auth.js"
import { StatusDatabase } from "./db.js"

const databases: StatusDatabase[] = []

function setup(nowValue = 1_800_000_000_000) {
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  let now = nowValue
  const auth = new AuthService(db, Buffer.alloc(32, 7), 4, () => now)
  return { db, auth, advance: (milliseconds: number) => { now += milliseconds } }
}

afterEach(() => {
  while (databases.length) databases.pop()?.close()
})

describe("independent appliance authentication", () => {
  it("matches the clinical password policy", async () => {
    const { auth } = setup()
    await expect(auth.initialize("admin@hospital.test", "lowercase1!"))
      .rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(auth.initialize("admin@hospital.test", "NoNumber!"))
      .rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(auth.initialize("admin@hospital.test", "NoSpecial1"))
      .rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(auth.initialize("admin@hospital.test", "Short1!"))
      .rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(auth.initialize("admin@hospital.test", "Accepted1!"))
      .resolves.toMatchObject({ generation: 1 })
  })

  it("initializes idempotently only for the same credential and generation", async () => {
    const { auth } = setup()
    await expect(auth.initialize("Admin@Hospital.test", "Strong password phrase1!", 4)).resolves.toEqual({
      generation: 4,
      idempotent: false,
    })
    await expect(auth.initialize("admin@hospital.test", "Strong password phrase1!", 4)).resolves.toEqual({
      generation: 4,
      idempotent: true,
    })
    await expect(auth.initialize("admin@hospital.test", "Different password phrase2!", 4)).rejects.toMatchObject({
      code: "ALREADY_INITIALIZED",
    })
    await expect(auth.initialize("admin@hospital.test", "Strong password phrase1!", 5)).rejects.toMatchObject({
      code: "ALREADY_INITIALIZED",
    })
  })

  it("authenticates both active and pending credentials until commit", async () => {
    const { auth } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const pending = await auth.prepare({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
      expectedGeneration: 1,
    })
    expect(pending).toMatchObject({ pendingGeneration: 2, idempotent: false })
    await expect(auth.login({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "127.0.0.1",
    })).resolves.toMatchObject({ kind: "password" })
    await expect(auth.login({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
      clientAddress: "127.0.0.2",
    })).resolves.toMatchObject({ kind: "password" })
    expect(auth.commit(pending.transactionId)).toEqual({ generation: 2 })
    await expect(auth.login({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "127.0.0.3",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
  })

  it("makes prepare restart-safe and rejects a competing change", async () => {
    const { auth } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const first = await auth.prepare({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
      expectedGeneration: 1,
    })
    const replay = await auth.prepare({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
      expectedGeneration: 1,
    })
    expect(replay).toEqual({ ...first, idempotent: true })
    await expect(auth.prepare({
      email: "other@hospital.test",
      password: "Another secure password3!",
      expectedGeneration: 1,
    })).rejects.toMatchObject({ code: "PENDING_CHANGE" })
  })

  it("revokes sessions when pending credentials commit", async () => {
    const { auth } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const login = await auth.login({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "127.0.0.1",
    })
    expect(auth.validateSession(login.sessionToken)).toBe(true)
    const pending = await auth.prepare({
      email: "admin@hospital.test",
      password: "Replacement password phrase2!",
    })
    auth.commit(pending.transactionId)
    expect(auth.validateSession(login.sessionToken)).toBe(false)
  })

  it("revokes sessions created with an abandoned pending credential", async () => {
    const { auth } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const pending = await auth.prepare({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
    })
    const pendingLogin = await auth.login({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
      clientAddress: "127.0.0.1",
    })
    expect(auth.validateSession(pendingLogin.sessionToken)).toBe(true)
    expect(auth.abort(pending.transactionId)).toEqual({ aborted: true })
    expect(auth.validateSession(pendingLogin.sessionToken)).toBe(false)
  })

  it("cannot create a pending-credential session after abort wins an in-flight login", async () => {
    const { auth, db } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const pending = await auth.prepare({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
    })
    const pendingHash = db.getAuth()?.pending_password_hash
    expect(pendingHash).toBeTruthy()

    let releaseComparison!: () => void
    let comparisonStarted!: () => void
    const comparisonGate = new Promise<void>(resolve => { releaseComparison = resolve })
    const started = new Promise<void>(resolve => { comparisonStarted = resolve })
    const racingAuth = new AuthService(
      db,
      Buffer.alloc(32, 7),
      4,
      () => 1_800_000_000_000,
      async (password, hash) => {
        if (hash === pendingHash) {
          comparisonStarted()
          await comparisonGate
        }
        return bcrypt.compare(password, hash)
      },
    )
    const login = racingAuth.login({
      email: "next@hospital.test",
      password: "Replacement password phrase2!",
      clientAddress: "127.0.0.1",
    })
    await started
    auth.abort(pending.transactionId)
    releaseComparison()
    await expect(login).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
  })

  it("admits at most five concurrent guesses per lockout window", async () => {
    const { auth } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => auth.login({
      email: "admin@hospital.test",
      password: "Wrong password phrase9!",
      clientAddress: "10.0.0.20",
    })))
    const codes = results.map(result => result.status === "rejected"
      && result.reason instanceof AuthError ? result.reason.code : "unexpected")
    expect(codes.filter(code => code === "INVALID_CREDENTIALS")).toHaveLength(5)
    expect(codes.filter(code => code === "RATE_LIMITED")).toHaveLength(7)
  })

  it("expires idle sessions and rate-limits five failed attempts", async () => {
    const { auth, advance } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const login = await auth.login({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "127.0.0.1",
    })
    advance(30 * 60_000 + 1)
    expect(auth.validateSession(login.sessionToken)).toBe(false)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(auth.login({
        email: "admin@hospital.test",
        password: "Wrong password phrase9!",
        clientAddress: "10.0.0.2",
      })).rejects.toBeInstanceOf(AuthError)
    }
    await expect(auth.login({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.2",
    })).rejects.toMatchObject({ code: "RATE_LIMITED" })
  })

  it("rate-limits one address across changing account names", async () => {
    const { auth } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(auth.login({
        email: `guess-${attempt}@hospital.test`,
        password: "Wrong password phrase9!",
        clientAddress: "10.0.0.9",
      })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
    }
    await expect(auth.login({
      email: "admin@hospital.test",
      password: "Initial password phrase1!",
      clientAddress: "10.0.0.9",
    })).rejects.toMatchObject({ code: "RATE_LIMITED" })
  })

  it("records fixed security events without operator identifiers", async () => {
    const { auth, db } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    await expect(auth.login({
      email: "admin@hospital.test",
      password: "Wrong password phrase9!",
      clientAddress: "10.0.0.2",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
    const serialized = JSON.stringify(db.getDashboard().events)
    expect(serialized).toContain("STATUS_AUTH_INITIALIZED")
    expect(serialized).toContain("STATUS_LOGIN_FAILED")
    expect(serialized).not.toContain("admin@hospital.test")
    expect(serialized).not.toContain("10.0.0.2")
    expect(serialized).not.toContain("Wrong password")
  })

  it("issues single-use short-lived recovery tokens", async () => {
    const { auth } = setup()
    await auth.initialize("admin@hospital.test", "Initial password phrase1!")
    const recovery = auth.createRecoveryToken(10)
    await expect(auth.login({ recoveryToken: recovery.token, clientAddress: "127.0.0.1" })).resolves.toMatchObject({
      kind: "recovery",
    })
    await expect(auth.login({ recoveryToken: recovery.token, clientAddress: "127.0.0.2" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    })
  })
})
