import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import bcrypt from "bcryptjs"
import { afterEach, describe, expect, it } from "vitest"
import { AuthService } from "./auth.js"
import { StatusDatabase } from "./db.js"
import { totpCode } from "./mfa.js"
import { sha256 } from "./util.js"

const databases: StatusDatabase[] = []
const temporaryDirectories: string[] = []

afterEach(() => {
  while (databases.length) databases.pop()?.close()
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
  }
})

function setup(path = ":memory:") {
  const db = new StatusDatabase(path)
  databases.push(db)
  let now = Date.parse("2026-08-23T09:00:00.000Z")
  const auth = new AuthService(
    db,
    Buffer.alloc(32, 4),
    4,
    () => now,
    undefined,
    Buffer.alloc(32, 8),
  )
  return {
    db,
    auth,
    now: () => now,
    advance: (milliseconds: number) => { now += milliseconds },
  }
}

async function enroll(
  auth: AuthService,
  now: number,
  email: string,
  password: string,
  address: string,
) {
  const challenge = await auth.beginPasswordLogin({ email, password, clientAddress: address })
  if (!challenge.manualKey) throw new Error("Expected a fresh MFA enrollment")
  const result = auth.completeMfaLogin({
    challengeToken: challenge.challengeToken,
    code: totpCode(challenge.manualKey, now),
    clientAddress: address,
  })
  return { challenge, result }
}

async function chiefSession(auth: AuthService, now: number) {
  await auth.initialize("Chief.IT@Hospital.test", "Initial password phrase1!")
  return (await enroll(
    auth,
    now,
    "chief.it@hospital.test",
    "Initial password phrase1!",
    "10.0.0.1",
  )).result.sessionToken
}

async function createAndActivateSecond(
  auth: AuthService,
  now: number,
  chiefToken: string,
) {
  const invitation = await auth.createStatusAdmin({
    sessionToken: chiefToken,
    currentPassword: "Initial password phrase1!",
    email: "Second.IT@Hospital.test",
    displayName: "инж. Мария Иванова",
    reason: "Добавяне на втори дежурен ИТ администратор",
  })
  await auth.redeemStatusAdminLink({
    token: invitation.token,
    purpose: "ACTIVATION",
    password: "Second password phrase2!",
  })
  return invitation
}

describe("multiple Status administrators", () => {
  it("creates one protected initial chief without any permission tier", async () => {
    const { db, auth } = setup()
    await auth.initialize("Chief.IT@Hospital.test", "Initial password phrase1!")
    expect(auth.listStatusAdmins()).toEqual([expect.objectContaining({
      id: "initial-chief",
      email: "chief.it@hospital.test",
      state: "ACTIVE",
      initialChief: true,
    })])
    const columns = db.sqlite.prepare("PRAGMA table_info(status_admins)").all() as Array<{ name: string }>
    expect(columns.map(column => column.name)).not.toContain("role")
    expect(columns.map(column => column.name)).not.toContain("permissions")
    for (const table of [
      "status_admin_sessions",
      "status_admin_reauth_attempts",
      "status_admin_console_recovery_tokens",
      "status_admin_mfa_state",
      "status_admin_mfa_recovery_codes",
      "status_admin_mfa_challenges",
      "status_admin_links",
    ]) {
      const names = (db.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
        .map(column => column.name)
      expect(names, table).toContain("admin_id")
    }
  })

  it("creates a case-insensitive unique pending identity and activates it exactly once", async () => {
    const { db, auth, now } = setup()
    const sessionToken = await chiefSession(auth, now())
    const invitation = await auth.createStatusAdmin({
      sessionToken,
      currentPassword: "Initial password phrase1!",
      email: "Second.IT@Hospital.test",
      displayName: "инж. Мария Иванова #2",
      reason: "Добавяне на втори дежурен ИТ администратор",
    })
    expect(invitation).toMatchObject({ purpose: "ACTIVATION" })
    const serialized = JSON.stringify({
      admins: db.sqlite.prepare("SELECT * FROM status_admins").all(),
      links: db.sqlite.prepare("SELECT * FROM status_admin_links").all(),
      events: db.getDashboard(now()).events,
    })
    expect(serialized).not.toContain(invitation.token)
    expect(serialized).not.toContain("Initial password phrase1!")
    expect(db.sqlite.prepare(
      "SELECT token_hash FROM status_admin_links WHERE purpose = 'ACTIVATION'",
    ).get()).toEqual({ token_hash: sha256(invitation.token) })
    await expect(auth.beginPasswordLogin({
      email: "second.it@hospital.test",
      password: "Second password phrase2!",
      clientAddress: "10.0.0.2",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
    await expect(auth.createStatusAdmin({
      sessionToken,
      currentPassword: "Initial password phrase1!",
      email: "SECOND.it@hospital.test",
      displayName: "Duplicate",
      reason: "Опит за повторно добавяне на същия администратор",
    })).rejects.toMatchObject({ code: "ADMIN_ALREADY_EXISTS" })

    await expect(auth.redeemStatusAdminLink({
      token: invitation.token,
      purpose: "ACTIVATION",
      password: "Second password phrase2!",
    })).resolves.toEqual({ email: "second.it@hospital.test" })
    await expect(auth.redeemStatusAdminLink({
      token: invitation.token,
      purpose: "ACTIVATION",
      password: "Another password phrase3!",
    })).rejects.toMatchObject({ code: "TOKEN_INVALID" })
    const secondLogin = await auth.beginPasswordLogin({
      email: "SECOND.IT@HOSPITAL.TEST",
      password: "Second password phrase2!",
      clientAddress: "10.0.0.2",
    })
    expect(secondLogin.enrollmentRequired).toBe(true)
    const principal = auth.listStatusAdmins().find(admin => !admin.initialChief)
    expect(principal).toMatchObject({
      displayName: "инж. Мария Иванова #2",
      state: "ACTIVE",
    })
    expect(db.listStatusAdminAudit().map(event => event.action)).toEqual([
      "ADMIN_CREATED",
      "ADMIN_ACTIVATED",
    ])
  })

  it("requires an MFA-completed password session, the actor password, and a reason", async () => {
    const { auth, now } = setup()
    const sessionToken = await chiefSession(auth, now())
    const consoleToken = auth.createRecoveryToken()
    const recoverySession = await auth.loginWithRecoveryToken({
      recoveryToken: consoleToken.token,
      clientAddress: "10.0.0.3",
    })
    const input = {
      email: "second@hospital.test",
      displayName: "Втори администратор",
      reason: "Добавяне на втори администратор за дежурства",
    }
    await expect(auth.createStatusAdmin({
      ...input,
      sessionToken: recoverySession.sessionToken,
      currentPassword: "Initial password phrase1!",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
    await expect(auth.createStatusAdmin({
      ...input,
      sessionToken,
      currentPassword: "Wrong password phrase9!",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
    await expect(auth.createStatusAdmin({
      ...input,
      sessionToken,
      currentPassword: "Initial password phrase1!",
      reason: "Кратко",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" })
  })

  it("binds MFA and sessions independently to each administrator", async () => {
    const { db, auth, now } = setup()
    const chiefToken = await chiefSession(auth, now())
    await createAndActivateSecond(auth, now(), chiefToken)
    const second = await enroll(
      auth,
      now(),
      "second.it@hospital.test",
      "Second password phrase2!",
      "10.0.0.4",
    )
    expect(auth.validateSession(chiefToken)).toBe(true)
    expect(auth.validateSession(second.result.sessionToken)).toBe(true)
    const sessionAdmins = db.sqlite.prepare(`
      SELECT DISTINCT admin_id FROM status_admin_sessions ORDER BY admin_id
    `).all() as Array<{ admin_id: string }>
    expect(sessionAdmins).toHaveLength(2)
    const mfaAdmins = db.sqlite.prepare(`
      SELECT DISTINCT admin_id FROM status_admin_mfa_state ORDER BY admin_id
    `).all() as Array<{ admin_id: string }>
    expect(mfaAdmins).toHaveLength(2)
    expect(second.challenge.manualKey).not.toBe("")
  })

  it("recovery revokes target sessions, replaces the verifier, and requires fresh MFA", async () => {
    const { db, auth, now } = setup()
    const chiefToken = await chiefSession(auth, now())
    await createAndActivateSecond(auth, now(), chiefToken)
    const second = await enroll(
      auth,
      now(),
      "second.it@hospital.test",
      "Second password phrase2!",
      "10.0.0.5",
    )
    const secondId = auth.listStatusAdmins().find(admin => !admin.initialChief)!.id
    const recovery = await auth.issueStatusAdminLink({
      sessionToken: chiefToken,
      currentPassword: "Initial password phrase1!",
      targetAdminId: secondId,
      purpose: "RECOVERY",
      reason: "Възстановяване след загубено устройство на колегата",
    })
    expect(auth.validateSession(second.result.sessionToken)).toBe(false)
    expect(JSON.stringify(db.sqlite.prepare("SELECT * FROM status_admin_links").all()))
      .not.toContain(recovery.token)
    await auth.redeemStatusAdminLink({
      token: recovery.token,
      purpose: "RECOVERY",
      password: "Recovered password phrase3!",
    })
    await expect(auth.beginPasswordLogin({
      email: "second.it@hospital.test",
      password: "Second password phrase2!",
      clientAddress: "10.0.0.6",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
    const challenge = await auth.beginPasswordLogin({
      email: "second.it@hospital.test",
      password: "Recovered password phrase3!",
      clientAddress: "10.0.0.7",
    })
    expect(challenge.enrollmentRequired).toBe(true)
    await expect(auth.redeemStatusAdminLink({
      token: recovery.token,
      purpose: "RECOVERY",
      password: "Replay password phrase4!",
    })).rejects.toMatchObject({ code: "TOKEN_INVALID" })
  })

  it("protects the initial chief, revokes a suspended admin, and guards the last enabled admin", async () => {
    const { db, auth, now } = setup()
    const chiefToken = await chiefSession(auth, now())
    await createAndActivateSecond(auth, now(), chiefToken)
    const second = await enroll(
      auth,
      now(),
      "second.it@hospital.test",
      "Second password phrase2!",
      "10.0.0.8",
    )
    const secondId = auth.listStatusAdmins().find(admin => !admin.initialChief)!.id
    await expect(auth.suspendStatusAdmin({
      sessionToken: chiefToken,
      currentPassword: "Initial password phrase1!",
      targetAdminId: "initial-chief",
      reason: "Проверка на защитата на главния администратор",
    })).rejects.toMatchObject({ code: "PROTECTED_ADMIN" })
    await auth.suspendStatusAdmin({
      sessionToken: chiefToken,
      currentPassword: "Initial password phrase1!",
      targetAdminId: secondId,
      reason: "Временно спиране при напускане на дежурния екип",
    })
    expect(auth.validateSession(second.result.sessionToken)).toBe(false)
    await expect(auth.beginPasswordLogin({
      email: "second.it@hospital.test",
      password: "Second password phrase2!",
      clientAddress: "10.0.0.9",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })

    const activation = await auth.issueStatusAdminLink({
      sessionToken: chiefToken,
      currentPassword: "Initial password phrase1!",
      targetAdminId: secondId,
      purpose: "ACTIVATION",
      reason: "Повторно включване след връщане в дежурния екип",
    })
    await auth.redeemStatusAdminLink({
      token: activation.token,
      purpose: "ACTIVATION",
      password: "Reactivated password phrase4!",
    })
    const reactivated = await enroll(
      auth,
      now(),
      "second.it@hospital.test",
      "Reactivated password phrase4!",
      "10.0.0.10",
    )
    db.sqlite.prepare(`
      UPDATE status_admins SET state = 'SUSPENDED', generation = generation + 1
      WHERE id = 'initial-chief'
    `).run()
    await expect(auth.suspendStatusAdmin({
      sessionToken: reactivated.result.sessionToken,
      currentPassword: "Reactivated password phrase4!",
      targetAdminId: secondId,
      reason: "Проверка на защитата на последния активен администратор",
    })).rejects.toMatchObject({ code: "LAST_ADMIN" })
  })

  it("serializes concurrent case-insensitive creation attempts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lospor-status-admin-race-"))
    temporaryDirectories.push(directory)
    const path = join(directory, "status.sqlite")
    const first = setup(path)
    const sessionToken = await chiefSession(first.auth, first.now())
    const secondDb = new StatusDatabase(path)
    databases.push(secondDb)
    const secondAuth = new AuthService(
      secondDb,
      Buffer.alloc(32, 4),
      4,
      first.now,
      undefined,
      Buffer.alloc(32, 8),
    )
    const create = (auth: AuthService, email: string) => auth.createStatusAdmin({
      sessionToken,
      currentPassword: "Initial password phrase1!",
      email,
      displayName: "Конкурентен администратор",
      reason: "Проверка на едновременна уникалност на имейла",
    })
    const outcomes = await Promise.allSettled([
      create(first.auth, "Race.Admin@Hospital.test"),
      create(secondAuth, "race.admin@hospital.test"),
    ])
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1)
    expect(first.auth.listStatusAdmins().filter(admin => admin.email === "race.admin@hospital.test"))
      .toHaveLength(1)
  })

  it("atomically copies a legacy chief and auth artifacts without deleting the legacy rows", () => {
    const directory = mkdtempSync(join(tmpdir(), "lospor-status-admin-migration-"))
    temporaryDirectories.push(directory)
    const path = join(directory, "status.sqlite")
    const legacy = new DatabaseSync(path)
    const now = Date.parse("2026-08-23T09:00:00.000Z")
    const hash = bcrypt.hashSync("Initial password phrase1!", 4)
    legacy.exec(`
      CREATE TABLE auth_state (
        singleton INTEGER PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL,
        generation INTEGER NOT NULL, pending_email TEXT, pending_password_hash TEXT,
        pending_generation INTEGER, pending_transaction_id TEXT, pending_expires_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, credential_generation INTEGER NOT NULL, auth_kind TEXT NOT NULL
      );
      CREATE TABLE login_failures (rate_key TEXT NOT NULL, occurred_at INTEGER NOT NULL);
      CREATE TABLE login_attempts (
        attempt_id TEXT NOT NULL, rate_key TEXT NOT NULL, occurred_at INTEGER NOT NULL,
        PRIMARY KEY(attempt_id, rate_key)
      );
      CREATE TABLE reauth_attempts (
        attempt_id TEXT PRIMARY KEY, session_hash TEXT NOT NULL, occurred_at INTEGER NOT NULL
      );
      CREATE TABLE recovery_tokens (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, consumed_at INTEGER);
      CREATE TABLE status_mfa_state (
        credential_generation INTEGER PRIMARY KEY, secret_ciphertext TEXT NOT NULL,
        enrolled_at INTEGER NOT NULL, last_totp_step INTEGER
      );
      CREATE TABLE status_mfa_recovery_codes (
        code_hash TEXT PRIMARY KEY, credential_generation INTEGER NOT NULL,
        created_at INTEGER NOT NULL, consumed_at INTEGER
      );
      CREATE TABLE status_mfa_challenges (
        token_hash TEXT PRIMARY KEY, credential_kind TEXT NOT NULL,
        credential_email TEXT NOT NULL, credential_password_hash TEXT NOT NULL,
        credential_generation INTEGER NOT NULL, credential_transaction_id TEXT,
        target_generation INTEGER NOT NULL, enrollment_secret_ciphertext TEXT,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
      );
    `)
    legacy.prepare(`
      INSERT INTO auth_state(singleton, email, password_hash, generation, created_at, updated_at)
      VALUES (1, ?, ?, 3, ?, ?)
    `).run("chief@hospital.test", hash, now, now)
    legacy.prepare(`
      INSERT INTO sessions(token_hash, created_at, last_seen_at, expires_at, credential_generation, auth_kind)
      VALUES (?, ?, ?, ?, 3, 'password')
    `).run(sha256("legacy-session-token-value-with-32-bytes"), now, now, now + 60_000)
    legacy.prepare(`
      INSERT INTO status_mfa_state(
        credential_generation, secret_ciphertext, enrolled_at, last_totp_step
      ) VALUES (3, 'legacy-encrypted-seed', ?, 123)
    `).run(now)
    legacy.close()

    const db = new StatusDatabase(path)
    databases.push(db)
    expect(db.getAuth()).toMatchObject({
      id: "initial-chief",
      email: "chief@hospital.test",
      password_hash: hash,
      generation: 3,
    })
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM status_admin_sessions").get())
      .toEqual({ count: 1 })
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM status_admin_mfa_state").get())
      .toEqual({ count: 1 })
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions").get())
      .toEqual({ count: 1 })
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM status_mfa_state").get())
      .toEqual({ count: 1 })
    expect(db.sqlite.prepare("SELECT version FROM status_auth_schema WHERE singleton = 1").get())
      .toEqual({ version: 2 })
  })
})
