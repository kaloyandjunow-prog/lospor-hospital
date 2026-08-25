import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import type {
  ApplianceSnapshot,
  CheckObservation,
  ComponentStatus,
  ComponentView,
  DashboardData,
  DayStatus,
  IncidentView,
  OperationalEventView,
} from "./types.js"
import { dayKey, safeJsonParse } from "./util.js"

const INITIAL_STATUS_ADMIN_ID = "initial-chief"

export type StatusAdminState = "PENDING_ACTIVATION" | "ACTIVE" | "SUSPENDED"
export type StatusAdminLinkPurpose = "ACTIVATION" | "RECOVERY"

export type StatusAdminSummary = {
  id: string
  email: string
  displayName: string
  state: StatusAdminState
  initialChief: boolean
  createdAt: number
  activatedAt: number | null
  activeActivationExpiresAt: number | null
  activeRecoveryExpiresAt: number | null
}

export type StatusSessionPrincipal = {
  adminId: string
  email: string
  displayName: string
  generation: number
  kind: "password" | "recovery"
}

export type StatusAdminCredential = {
  id: string
  email: string
  passwordHash: string
  generation: number
  pendingEmail: string | null
  pendingPasswordHash: string | null
  pendingGeneration: number | null
  pendingTransactionId: string | null
  pendingExpiresAt: number | null
}

export class StatusAdminStoreError extends Error {
  constructor(readonly code:
    | "ADMIN_ALREADY_EXISTS"
    | "ADMIN_NOT_FOUND"
    | "ADMIN_STATE_INVALID"
    | "PROTECTED_ADMIN"
    | "LAST_ADMIN"
    | "INVALID_ACTOR"
    | "TOKEN_INVALID",
  ) {
    super(code)
  }
}

type StatusAdminRow = {
  id: string
  email: string
  email_canonical: string
  display_name: string
  password_hash: string | null
  generation: number
  state: StatusAdminState
  is_initial_chief: number
  created_at: number
  activated_at: number | null
  suspended_at: number | null
  updated_at: number
  pending_email: string | null
  pending_email_canonical: string | null
  pending_password_hash: string | null
  pending_generation: number | null
  pending_transaction_id: string | null
  pending_expires_at: number | null
}

type AuthRow = {
  id: string
  email: string
  password_hash: string
  generation: number
  pending_email: string | null
  pending_password_hash: string | null
  pending_generation: number | null
  pending_transaction_id: string | null
  pending_expires_at: number | null
}

export type PasswordCredentialMatch = {
  kind: "current" | "pending"
  adminId: string
  email: string
  passwordHash: string
  generation: number
  transactionId?: string
}

type MfaStateRow = {
  credential_generation: number
  secret_ciphertext: string
  enrolled_at: number
  last_totp_step: number | null
}

type MfaChallengeRow = {
  token_hash: string
  credential_kind: "current" | "pending"
  credential_email: string
  credential_password_hash: string
  credential_generation: number
  credential_transaction_id: string | null
  target_generation: number
  enrollment_secret_ciphertext: string | null
  created_at: number
  expires_at: number
  consumed_at: number | null
}

export type MfaChallengeMaterial = {
  email: string
  targetGeneration: number
  secretCiphertext: string
  enrollmentRequired: boolean
  expiresAt: number
}

type AdminMfaStateRow = MfaStateRow & { admin_id: string }
type AdminMfaChallengeRow = MfaChallengeRow & { admin_id: string }

export type AdminMfaChallengeMaterial = MfaChallengeMaterial & { adminId: string }

type ComponentRow = {
  component: string
  label: string
  group_name: "clinical" | "research" | "safety"
  status: ComponentStatus
  observed_status: ComponentStatus
  detail_code: string
  consecutive_successes: number
  consecutive_failures: number
  last_checked_at: number
  changed_at: number
  latency_ms: number | null
}

const STATUS_RANK: Record<ComponentStatus, number> = {
  operational: 0,
  "not-configured": 1,
  unknown: 2,
  degraded: 3,
  outage: 4,
}

export class StatusDatabase {
  readonly sqlite: DatabaseSync
  private readonly liveComponents = new Map<string, {
    view: ComponentView
    successes: number
    failures: number
  }>()
  private readonly liveEvents = new Map<string, OperationalEventView>()
  private liveSnapshot: { snapshot: ApplianceSnapshot; receivedAt: number } | null = null
  private historyStorageHealthy = true

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.sqlite = new DatabaseSync(path)
    this.sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA max_page_count = 32768;")
    this.migrate()
  }

  close(): void {
    this.sqlite.close()
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS auth_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        generation INTEGER NOT NULL CHECK (generation >= 1),
        pending_email TEXT,
        pending_password_hash TEXT,
        pending_generation INTEGER,
        pending_transaction_id TEXT,
        pending_expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS status_admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        email_canonical TEXT NOT NULL COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        generation INTEGER NOT NULL CHECK (generation >= 1),
        state TEXT NOT NULL CHECK (state IN ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED')),
        is_initial_chief INTEGER NOT NULL DEFAULT 0 CHECK (is_initial_chief IN (0, 1)),
        created_by_admin_id TEXT REFERENCES status_admins(id),
        created_at INTEGER NOT NULL,
        activated_at INTEGER,
        suspended_at INTEGER,
        updated_at INTEGER NOT NULL,
        pending_email TEXT,
        pending_email_canonical TEXT COLLATE NOCASE,
        pending_password_hash TEXT,
        pending_generation INTEGER,
        pending_transaction_id TEXT,
        pending_expires_at INTEGER,
        CHECK ((state = 'PENDING_ACTIVATION' AND password_hash IS NULL)
          OR (state IN ('ACTIVE', 'SUSPENDED') AND password_hash IS NOT NULL))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS status_admin_email_unique
        ON status_admins(email_canonical COLLATE NOCASE);
      CREATE UNIQUE INDEX IF NOT EXISTS status_admin_pending_email_unique
        ON status_admins(pending_email_canonical COLLATE NOCASE)
        WHERE pending_email_canonical IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS status_admin_initial_chief_unique
        ON status_admins(is_initial_chief) WHERE is_initial_chief = 1;
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        credential_generation INTEGER NOT NULL,
        auth_kind TEXT NOT NULL CHECK (auth_kind IN ('password', 'recovery'))
      );
      CREATE TABLE IF NOT EXISTS login_failures (
        rate_key TEXT NOT NULL,
        occurred_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS login_failures_lookup ON login_failures(rate_key, occurred_at);
      CREATE TABLE IF NOT EXISTS login_attempts (
        attempt_id TEXT NOT NULL,
        rate_key TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        PRIMARY KEY(attempt_id, rate_key)
      );
      CREATE INDEX IF NOT EXISTS login_attempts_lookup ON login_attempts(rate_key, occurred_at);
      CREATE TABLE IF NOT EXISTS reauth_attempts (
        attempt_id TEXT PRIMARY KEY,
        session_hash TEXT NOT NULL,
        occurred_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS reauth_attempts_lookup
        ON reauth_attempts(session_hash, occurred_at);
      CREATE TABLE IF NOT EXISTS recovery_tokens (
        token_hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS status_mfa_state (
        credential_generation INTEGER PRIMARY KEY CHECK (credential_generation >= 1),
        secret_ciphertext TEXT NOT NULL,
        enrolled_at INTEGER NOT NULL,
        last_totp_step INTEGER
      );
      CREATE TABLE IF NOT EXISTS status_mfa_recovery_codes (
        code_hash TEXT PRIMARY KEY,
        credential_generation INTEGER NOT NULL CHECK (credential_generation >= 1),
        created_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS status_mfa_recovery_generation
        ON status_mfa_recovery_codes(credential_generation, consumed_at);
      CREATE TABLE IF NOT EXISTS status_mfa_challenges (
        token_hash TEXT PRIMARY KEY,
        credential_kind TEXT NOT NULL CHECK (credential_kind IN ('current', 'pending')),
        credential_email TEXT NOT NULL,
        credential_password_hash TEXT NOT NULL,
        credential_generation INTEGER NOT NULL,
        credential_transaction_id TEXT,
        target_generation INTEGER NOT NULL,
        enrollment_secret_ciphertext TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS status_mfa_challenge_expiry
        ON status_mfa_challenges(expires_at, consumed_at);
      CREATE TABLE IF NOT EXISTS status_admin_sessions (
        token_hash TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES status_admins(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        credential_generation INTEGER NOT NULL,
        auth_kind TEXT NOT NULL CHECK (auth_kind IN ('password', 'recovery'))
      );
      CREATE TABLE IF NOT EXISTS status_admin_reauth_attempts (
        attempt_id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES status_admins(id) ON DELETE CASCADE,
        session_hash TEXT NOT NULL,
        occurred_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS status_admin_reauth_lookup
        ON status_admin_reauth_attempts(admin_id, session_hash, occurred_at);
      CREATE TABLE IF NOT EXISTS status_admin_console_recovery_tokens (
        token_hash TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES status_admins(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS status_admin_mfa_state (
        admin_id TEXT NOT NULL REFERENCES status_admins(id) ON DELETE CASCADE,
        credential_generation INTEGER NOT NULL CHECK (credential_generation >= 1),
        secret_ciphertext TEXT NOT NULL,
        enrolled_at INTEGER NOT NULL,
        last_totp_step INTEGER,
        PRIMARY KEY(admin_id, credential_generation)
      );
      CREATE TABLE IF NOT EXISTS status_admin_mfa_recovery_codes (
        code_hash TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES status_admins(id) ON DELETE CASCADE,
        credential_generation INTEGER NOT NULL CHECK (credential_generation >= 1),
        created_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS status_admin_mfa_recovery_generation
        ON status_admin_mfa_recovery_codes(admin_id, credential_generation, consumed_at);
      CREATE TABLE IF NOT EXISTS status_admin_mfa_challenges (
        token_hash TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES status_admins(id) ON DELETE CASCADE,
        credential_kind TEXT NOT NULL CHECK (credential_kind IN ('current', 'pending')),
        credential_email TEXT NOT NULL,
        credential_password_hash TEXT NOT NULL,
        credential_generation INTEGER NOT NULL,
        credential_transaction_id TEXT,
        target_generation INTEGER NOT NULL,
        enrollment_secret_ciphertext TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS status_admin_mfa_challenge_expiry
        ON status_admin_mfa_challenges(expires_at, consumed_at);
      CREATE TABLE IF NOT EXISTS status_admin_links (
        token_hash TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES status_admins(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK (purpose IN ('ACTIVATION', 'RECOVERY')),
        issued_by_admin_id TEXT NOT NULL REFERENCES status_admins(id),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS status_admin_links_target
        ON status_admin_links(admin_id, purpose, consumed_at, expires_at);
      CREATE TABLE IF NOT EXISTS status_admin_audit (
        id TEXT PRIMARY KEY,
        actor_admin_id TEXT REFERENCES status_admins(id),
        target_admin_id TEXT NOT NULL REFERENCES status_admins(id),
        action TEXT NOT NULL CHECK (action IN (
          'ADMIN_CREATED', 'ACTIVATION_REISSUED', 'ADMIN_ACTIVATED',
          'RECOVERY_ISSUED', 'ADMIN_RECOVERED', 'ADMIN_SUSPENDED'
        )),
        reason TEXT NOT NULL,
        occurred_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS status_admin_audit_time
        ON status_admin_audit(occurred_at DESC);
      CREATE TABLE IF NOT EXISTS status_auth_schema (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        version INTEGER NOT NULL,
        migrated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS component_state (
        component TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        group_name TEXT NOT NULL,
        status TEXT NOT NULL,
        observed_status TEXT NOT NULL,
        detail_code TEXT NOT NULL,
        consecutive_successes INTEGER NOT NULL,
        consecutive_failures INTEGER NOT NULL,
        last_checked_at INTEGER NOT NULL,
        changed_at INTEGER NOT NULL,
        latency_ms INTEGER
      );
      CREATE TABLE IF NOT EXISTS availability_samples (
        component TEXT NOT NULL,
        checked_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        status_rank INTEGER NOT NULL,
        detail_code TEXT NOT NULL,
        latency_ms INTEGER,
        PRIMARY KEY(component, checked_at)
      );
      CREATE INDEX IF NOT EXISTS availability_component_time ON availability_samples(component, checked_at);
      CREATE TABLE IF NOT EXISTS availability_daily (
        component TEXT NOT NULL,
        day TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY(component, day)
      );
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        component TEXT NOT NULL,
        label TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        resolved_at INTEGER,
        opening_status TEXT NOT NULL,
        code TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS incidents_time ON incidents(opened_at);
      CREATE TABLE IF NOT EXISTS operational_events (
        id TEXT PRIMARY KEY,
        producer TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        code TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        facts_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS operational_events_time ON operational_events(occurred_at);
      CREATE TABLE IF NOT EXISTS snapshot_cache (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        snapshot_json TEXT NOT NULL,
        received_at INTEGER NOT NULL
      );
    `)
    this.migrateMultiAdminAuth()
  }

  /**
   * Non-destructive, atomic migration from singleton authentication. The old
   * tables remain as rollback evidence, while all active authentication moves
   * to administrator-ID-bound tables. Existing bcrypt/MFA material is copied;
   * no plaintext credential is needed or synthesized.
   */
  private migrateMultiAdminAuth(): void {
    this.transaction(() => {
      const migrated = this.sqlite.prepare(
        "SELECT version FROM status_auth_schema WHERE singleton = 1",
      ).get() as { version: number } | undefined
      if (migrated?.version === 2) return

      const legacyAuth = this.sqlite.prepare(
        "SELECT * FROM auth_state WHERE singleton = 1",
      ).get() as (Omit<AuthRow, "id"> & { created_at: number; updated_at: number }) | undefined
      const adminCount = (this.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM status_admins",
      ).get() as { count: number }).count
      if (adminCount === 0 && legacyAuth) {
        this.sqlite.prepare(`
          INSERT INTO status_admins(
            id, email, email_canonical, display_name, password_hash, generation,
            state, is_initial_chief, created_at, activated_at, updated_at,
            pending_email, pending_email_canonical, pending_password_hash,
            pending_generation, pending_transaction_id, pending_expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          INITIAL_STATUS_ADMIN_ID,
          legacyAuth.email,
          legacyAuth.email.trim().toLowerCase(),
          "Initial chief IT administrator",
          legacyAuth.password_hash,
          legacyAuth.generation,
          legacyAuth.created_at,
          legacyAuth.created_at,
          legacyAuth.updated_at,
          legacyAuth.pending_email,
          legacyAuth.pending_email?.trim().toLowerCase() ?? null,
          legacyAuth.pending_password_hash,
          legacyAuth.pending_generation,
          legacyAuth.pending_transaction_id,
          legacyAuth.pending_expires_at,
        )
      }

      const chief = this.sqlite.prepare(
        "SELECT id FROM status_admins WHERE is_initial_chief = 1",
      ).get() as { id: string } | undefined
      const legacyArtifactCount = [
        "sessions",
        "recovery_tokens",
        "status_mfa_state",
        "status_mfa_recovery_codes",
        "status_mfa_challenges",
        "reauth_attempts",
      ].reduce((total, table) => total + (this.sqlite.prepare(
        `SELECT COUNT(*) AS count FROM ${table}`,
      ).get() as { count: number }).count, 0)
      if (legacyArtifactCount > 0 && !chief) {
        throw new Error("Cannot bind legacy Status authentication artifacts without the initial chief")
      }
      if (chief) {
        this.sqlite.prepare(`
          INSERT OR IGNORE INTO status_admin_sessions(
            token_hash, admin_id, created_at, last_seen_at, expires_at,
            credential_generation, auth_kind
          ) SELECT token_hash, ?, created_at, last_seen_at, expires_at,
            credential_generation, auth_kind FROM sessions
        `).run(chief.id)
        this.sqlite.prepare(`
          INSERT OR IGNORE INTO status_admin_reauth_attempts(
            attempt_id, admin_id, session_hash, occurred_at
          ) SELECT attempt_id, ?, session_hash, occurred_at FROM reauth_attempts
        `).run(chief.id)
        this.sqlite.prepare(`
          INSERT OR IGNORE INTO status_admin_console_recovery_tokens(
            token_hash, admin_id, expires_at, consumed_at
          ) SELECT token_hash, ?, expires_at, consumed_at FROM recovery_tokens
        `).run(chief.id)
        this.sqlite.prepare(`
          INSERT OR IGNORE INTO status_admin_mfa_state(
            admin_id, credential_generation, secret_ciphertext, enrolled_at, last_totp_step
          ) SELECT ?, credential_generation, secret_ciphertext, enrolled_at, last_totp_step
            FROM status_mfa_state
        `).run(chief.id)
        this.sqlite.prepare(`
          INSERT OR IGNORE INTO status_admin_mfa_recovery_codes(
            code_hash, admin_id, credential_generation, created_at, consumed_at
          ) SELECT code_hash, ?, credential_generation, created_at, consumed_at
            FROM status_mfa_recovery_codes
        `).run(chief.id)
        this.sqlite.prepare(`
          INSERT OR IGNORE INTO status_admin_mfa_challenges(
            token_hash, admin_id, credential_kind, credential_email,
            credential_password_hash, credential_generation,
            credential_transaction_id, target_generation,
            enrollment_secret_ciphertext, created_at, expires_at, consumed_at
          ) SELECT token_hash, ?, credential_kind, credential_email,
            credential_password_hash, credential_generation,
            credential_transaction_id, target_generation,
            enrollment_secret_ciphertext, created_at, expires_at, consumed_at
            FROM status_mfa_challenges
        `).run(chief.id)
      }
      this.sqlite.prepare(`
        INSERT INTO status_auth_schema(singleton, version, migrated_at)
        VALUES (1, 2, ?)
        ON CONFLICT(singleton) DO UPDATE SET version = excluded.version,
          migrated_at = excluded.migrated_at
      `).run(Date.now())
    })
  }

  transaction<T>(operation: () => T): T {
    let began = false
    try {
      this.sqlite.exec("BEGIN IMMEDIATE")
      began = true
      const result = operation()
      this.sqlite.exec("COMMIT")
      return result
    } catch (error) {
      if (began) {
        try {
          this.sqlite.exec("ROLLBACK")
        } catch {
          // Preserve the original storage failure. Authentication operations
          // still fail closed; monitoring calls provide an in-memory fallback.
        }
      }
      throw error
    }
  }

  getAuth(): AuthRow | null {
    return (this.sqlite.prepare(`
      SELECT id, email, password_hash, generation, pending_email,
        pending_password_hash, pending_generation, pending_transaction_id,
        pending_expires_at
      FROM status_admins
      WHERE is_initial_chief = 1 AND state = 'ACTIVE' AND password_hash IS NOT NULL
    `).get() as AuthRow | undefined) ?? null
  }

  initializeAuth(email: string, passwordHash: string, generation: number, now: number): void {
    this.transaction(() => {
      const count = (this.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM status_admins",
      ).get() as { count: number }).count
      if (count !== 0) throw new Error("Status authentication is already initialized")
      this.sqlite.prepare(`
        INSERT INTO status_admins(
          id, email, email_canonical, display_name, password_hash, generation,
          state, is_initial_chief, created_at, activated_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?)
      `).run(
        INITIAL_STATUS_ADMIN_ID,
        email,
        email.trim().toLowerCase(),
        "Initial chief IT administrator",
        passwordHash,
        generation,
        now,
        now,
        now,
      )
      this.sqlite.prepare(`
        INSERT INTO auth_state(singleton, email, password_hash, generation, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?)
      `).run(email, passwordHash, generation, now, now)
    })
  }

  setPendingAuth(
    email: string,
    passwordHash: string,
    generation: number,
    transactionId: string,
    expiresAt: number,
    now: number,
  ): void {
    this.transaction(() => {
      const auth = this.getAuth()
      if (!auth) throw new Error("Status authentication is not initialized")
      const canonical = email.trim().toLowerCase()
      const conflict = this.sqlite.prepare(`
        SELECT 1 FROM status_admins
        WHERE id <> ? AND (email_canonical = ? OR pending_email_canonical = ?)
      `).get(auth.id, canonical, canonical)
      if (conflict) throw new Error("Status administrator email is already in use")
      const result = this.sqlite.prepare(`
        UPDATE status_admins SET pending_email = ?, pending_email_canonical = ?,
          pending_password_hash = ?, pending_generation = ?, pending_transaction_id = ?,
          pending_expires_at = ?, updated_at = ? WHERE id = ?
      `).run(email, canonical, passwordHash, generation, transactionId, expiresAt, now, auth.id)
      if (result.changes !== 1) throw new Error("Status authentication is not initialized")
      this.sqlite.prepare(`
        UPDATE auth_state SET pending_email = ?, pending_password_hash = ?, pending_generation = ?,
          pending_transaction_id = ?, pending_expires_at = ?, updated_at = ? WHERE singleton = 1
      `).run(email, passwordHash, generation, transactionId, expiresAt, now)
    })
  }

  commitPendingAuth(transactionId: string, now: number): number {
    return this.transaction(() => {
      const auth = this.getAuth()
      if (!auth || auth.pending_transaction_id !== transactionId
        || !auth.pending_email || !auth.pending_password_hash || !auth.pending_generation
        || !auth.pending_expires_at || auth.pending_expires_at <= now) {
        throw new Error("No matching pending credential change")
      }
      this.sqlite.prepare(`
        UPDATE status_admins SET email = pending_email,
          email_canonical = pending_email_canonical,
          password_hash = pending_password_hash,
          generation = pending_generation, pending_email = NULL, pending_password_hash = NULL,
          pending_email_canonical = NULL, pending_generation = NULL,
          pending_transaction_id = NULL, pending_expires_at = NULL,
          updated_at = ? WHERE id = ?
      `).run(now, auth.id)
      this.sqlite.prepare(`
        UPDATE auth_state SET email = ?, password_hash = ?, generation = ?,
          pending_email = NULL, pending_password_hash = NULL,
          pending_generation = NULL, pending_transaction_id = NULL,
          pending_expires_at = NULL, updated_at = ? WHERE singleton = 1
      `).run(auth.pending_email, auth.pending_password_hash, auth.pending_generation, now)
      this.sqlite.prepare("DELETE FROM status_admin_sessions WHERE admin_id = ?").run(auth.id)
      this.sqlite.prepare("DELETE FROM status_admin_mfa_challenges WHERE admin_id = ?").run(auth.id)
      this.sqlite.prepare(
        "DELETE FROM status_admin_mfa_recovery_codes WHERE admin_id = ? AND credential_generation <> ?",
      ).run(auth.id, auth.pending_generation)
      this.sqlite.prepare(
        "DELETE FROM status_admin_mfa_state WHERE admin_id = ? AND credential_generation <> ?",
      ).run(auth.id, auth.pending_generation)
      this.sqlite.prepare(
        "UPDATE status_admin_links SET consumed_at = ? WHERE admin_id = ? AND consumed_at IS NULL",
      ).run(now, auth.id)
      return auth.pending_generation
    })
  }

  abortPendingAuth(transactionId: string, now: number): void {
    this.transaction(() => {
      const result = this.sqlite.prepare(`
        UPDATE status_admins SET pending_email = NULL, pending_email_canonical = NULL,
          pending_password_hash = NULL, pending_generation = NULL,
          pending_transaction_id = NULL, pending_expires_at = NULL, updated_at = ?
        WHERE is_initial_chief = 1 AND pending_transaction_id = ?
      `).run(now, transactionId)
      if (result.changes !== 1) throw new Error("No matching pending credential change")
      this.sqlite.prepare(`
        UPDATE auth_state SET pending_email = NULL, pending_password_hash = NULL,
          pending_generation = NULL, pending_transaction_id = NULL, pending_expires_at = NULL,
          updated_at = ? WHERE singleton = 1 AND pending_transaction_id = ?
      `).run(now, transactionId)
      // A pending credential is allowed to sign in while a coordinated rotation
      // is in flight. Abort must therefore invalidate every session, including
      // any session created with the credential that has just been abandoned.
      const auth = this.getAuth()
      if (!auth) throw new Error("Status authentication is not initialized")
      this.sqlite.prepare("DELETE FROM status_admin_sessions WHERE admin_id = ?").run(auth.id)
      this.sqlite.prepare("DELETE FROM status_admin_mfa_challenges WHERE admin_id = ?").run(auth.id)
      this.sqlite.prepare(
        "DELETE FROM status_admin_mfa_recovery_codes WHERE admin_id = ? AND credential_generation <> ?",
      ).run(auth.id, auth.generation)
      this.sqlite.prepare(
        "DELETE FROM status_admin_mfa_state WHERE admin_id = ? AND credential_generation <> ?",
      ).run(auth.id, auth.generation)
    })
  }

  reserveLoginAttempt(attemptId: string, rateKeys: readonly string[], now: number): boolean {
    return this.transaction(() => {
      const cutoff = now - 15 * 60_000
      this.sqlite.prepare("DELETE FROM login_attempts WHERE occurred_at < ?").run(cutoff)
      const count = this.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE rate_key = ? AND occurred_at >= ?",
      )
      if (rateKeys.some(rateKey => (count.get(rateKey, cutoff) as { count: number }).count >= 5)) {
        return false
      }
      const insert = this.sqlite.prepare(
        "INSERT INTO login_attempts(attempt_id, rate_key, occurred_at) VALUES (?, ?, ?)",
      )
      for (const rateKey of rateKeys) insert.run(attemptId, rateKey, now)
      return true
    })
  }

  reserveReauthAttempt(attemptId: string, sessionHash: string, now: number): boolean {
    return this.transaction(() => {
      const cutoff = now - 15 * 60_000
      this.sqlite.prepare("DELETE FROM reauth_attempts WHERE occurred_at < ?").run(cutoff)
      const row = this.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM reauth_attempts WHERE session_hash = ? AND occurred_at >= ?",
      ).get(sessionHash, cutoff) as { count: number }
      if (row.count >= 5) return false
      this.sqlite.prepare(
        "INSERT INTO reauth_attempts(attempt_id, session_hash, occurred_at) VALUES (?, ?, ?)",
      ).run(attemptId, sessionHash, now)
      return true
    })
  }

  completeReauthAttempt(attemptId: string, sessionHash: string, success: boolean): void {
    this.transaction(() => {
      if (success) {
        this.sqlite.prepare("DELETE FROM reauth_attempts WHERE session_hash = ?").run(sessionHash)
      } else {
        // Keep the failed attempt, but ensure an unrelated caller cannot leave
        // a reservation against this session.
        this.sqlite.prepare(
          "DELETE FROM reauth_attempts WHERE attempt_id = ? AND session_hash <> ?",
        ).run(attemptId, sessionHash)
      }
    })
  }

  private resolvePasswordMatch(
    auth: AuthRow,
    match: PasswordCredentialMatch,
    now: number,
  ): { targetGeneration: number } | null {
    const matchesCurrent = match.kind === "current"
      && auth.email === match.email
      && auth.password_hash === match.passwordHash
      && auth.generation === match.generation
    if (matchesCurrent) return { targetGeneration: auth.generation }

    const matchesPending = match.kind === "pending"
      && auth.generation === match.generation
      && auth.pending_email === match.email
      && auth.pending_password_hash === match.passwordHash
      && auth.pending_generation === match.generation + 1
      && auth.pending_transaction_id === match.transactionId
      && Boolean(auth.pending_expires_at && auth.pending_expires_at > now)
    if (matchesPending) return { targetGeneration: match.generation + 1 }

    // A coordinated commit may win after bcrypt completes. The former pending
    // verifier is now the active credential and remains safe to accept.
    const pendingWasCommitted = match.kind === "pending"
      && auth.email === match.email
      && auth.password_hash === match.passwordHash
      && auth.generation === match.generation + 1
    return pendingWasCommitted ? { targetGeneration: auth.generation } : null
  }

  createPasswordSession(
    tokenHash: string,
    attemptId: string,
    match: PasswordCredentialMatch,
    now: number,
  ): boolean {
    return this.transaction(() => {
      const auth = this.getAuth()
      if (!auth) return false
      if (!this.resolvePasswordMatch(auth, match, now)) return false
      this.insertSession(tokenHash, auth.generation, "password", now)
      this.sqlite.prepare("DELETE FROM login_attempts WHERE attempt_id = ?").run(attemptId)
      return true
    })
  }

  createMfaChallenge(input: {
    tokenHash: string
    attemptId: string
    match: PasswordCredentialMatch
    enrollmentSecretCiphertext: string
    now: number
    expiresAt: number
  }): { targetGeneration: number; enrollmentRequired: boolean } | null {
    return this.transaction(() => {
      const auth = this.getAuth()
      if (!auth) return null
      const resolved = this.resolvePasswordMatch(auth, input.match, input.now)
      if (!resolved) return null
      this.sqlite.prepare(
        "DELETE FROM status_mfa_challenges WHERE consumed_at IS NOT NULL OR expires_at <= ?",
      ).run(input.now)
      const state = this.sqlite.prepare(`
        SELECT credential_generation FROM status_mfa_state
        WHERE credential_generation = ?
      `).get(resolved.targetGeneration)
      const enrollmentRequired = !state
      this.sqlite.prepare(`
        INSERT INTO status_mfa_challenges(
          token_hash, credential_kind, credential_email, credential_password_hash,
          credential_generation, credential_transaction_id, target_generation,
          enrollment_secret_ciphertext, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.tokenHash,
        input.match.kind,
        input.match.email,
        input.match.passwordHash,
        input.match.generation,
        input.match.transactionId ?? null,
        resolved.targetGeneration,
        enrollmentRequired ? input.enrollmentSecretCiphertext : null,
        input.now,
        input.expiresAt,
      )
      this.sqlite.prepare("DELETE FROM login_attempts WHERE attempt_id = ?").run(input.attemptId)
      return { targetGeneration: resolved.targetGeneration, enrollmentRequired }
    })
  }

  getMfaChallengeMaterial(tokenHash: string, now: number): MfaChallengeMaterial | null {
    return this.transaction(() => {
      const challenge = this.sqlite.prepare(`
        SELECT * FROM status_mfa_challenges
        WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      `).get(tokenHash, now) as MfaChallengeRow | undefined
      if (!challenge) return null
      const auth = this.getAuth()
      if (!auth || !this.resolvePasswordMatch(auth, {
        kind: challenge.credential_kind,
        adminId: auth.id,
        email: challenge.credential_email,
        passwordHash: challenge.credential_password_hash,
        generation: challenge.credential_generation,
        ...(challenge.credential_transaction_id
          ? { transactionId: challenge.credential_transaction_id }
          : {}),
      }, now)) return null

      const state = this.sqlite.prepare(
        "SELECT * FROM status_mfa_state WHERE credential_generation = ?",
      ).get(challenge.target_generation) as MfaStateRow | undefined
      if (challenge.enrollment_secret_ciphertext) {
        // A different first-login challenge may have enrolled while this page
        // was open. Restart instead of accepting a code for an obsolete seed.
        if (state) return null
        return {
          email: challenge.credential_email,
          targetGeneration: challenge.target_generation,
          secretCiphertext: challenge.enrollment_secret_ciphertext,
          enrollmentRequired: true,
          expiresAt: challenge.expires_at,
        }
      }
      if (!state) return null
      return {
        email: challenge.credential_email,
        targetGeneration: challenge.target_generation,
        secretCiphertext: state.secret_ciphertext,
        enrollmentRequired: false,
        expiresAt: challenge.expires_at,
      }
    })
  }

  completeMfaSession(input: {
    challengeHash: string
    sessionHash: string
    attemptId: string
    now: number
    totpStep?: number
    recoveryCodeHash?: string
    enrollmentRecoveryCodeHashes?: readonly string[]
  }): boolean {
    return this.transaction(() => {
      const challenge = this.sqlite.prepare(`
        SELECT * FROM status_mfa_challenges
        WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      `).get(input.challengeHash, input.now) as MfaChallengeRow | undefined
      if (!challenge) return false
      const auth = this.getAuth()
      if (!auth || !this.resolvePasswordMatch(auth, {
        kind: challenge.credential_kind,
        adminId: auth.id,
        email: challenge.credential_email,
        passwordHash: challenge.credential_password_hash,
        generation: challenge.credential_generation,
        ...(challenge.credential_transaction_id
          ? { transactionId: challenge.credential_transaction_id }
          : {}),
      }, input.now)) return false

      const usesTotp = Number.isInteger(input.totpStep) && input.totpStep! >= 0
      const usesRecovery = Boolean(input.recoveryCodeHash)
      if (usesTotp === usesRecovery) return false

      if (challenge.enrollment_secret_ciphertext) {
        const hashes = input.enrollmentRecoveryCodeHashes
        if (!usesTotp || !hashes || hashes.length !== 10 || new Set(hashes).size !== 10) return false
        const existing = this.sqlite.prepare(
          "SELECT 1 FROM status_mfa_state WHERE credential_generation = ?",
        ).get(challenge.target_generation)
        if (existing) return false
        this.sqlite.prepare(`
          INSERT INTO status_mfa_state(
            credential_generation, secret_ciphertext, enrolled_at, last_totp_step
          ) VALUES (?, ?, ?, ?)
        `).run(
          challenge.target_generation,
          challenge.enrollment_secret_ciphertext,
          input.now,
          input.totpStep!,
        )
        const insertRecovery = this.sqlite.prepare(`
          INSERT INTO status_mfa_recovery_codes(
            code_hash, credential_generation, created_at
          ) VALUES (?, ?, ?)
        `)
        for (const hash of hashes) insertRecovery.run(hash, challenge.target_generation, input.now)
      } else if (usesTotp) {
        const updated = this.sqlite.prepare(`
          UPDATE status_mfa_state SET last_totp_step = ?
          WHERE credential_generation = ?
            AND (last_totp_step IS NULL OR last_totp_step < ?)
        `).run(input.totpStep!, challenge.target_generation, input.totpStep!)
        if (updated.changes !== 1) return false
      } else {
        const consumed = this.sqlite.prepare(`
          UPDATE status_mfa_recovery_codes SET consumed_at = ?
          WHERE code_hash = ? AND credential_generation = ? AND consumed_at IS NULL
        `).run(input.now, input.recoveryCodeHash!, challenge.target_generation)
        if (consumed.changes !== 1) return false
      }

      const consumedChallenge = this.sqlite.prepare(`
        UPDATE status_mfa_challenges SET consumed_at = ?
        WHERE token_hash = ? AND consumed_at IS NULL
      `).run(input.now, input.challengeHash)
      if (consumedChallenge.changes !== 1) return false
      this.insertSession(input.sessionHash, auth.generation, "password", input.now)
      this.sqlite.prepare("DELETE FROM login_attempts WHERE attempt_id = ?").run(input.attemptId)
      return true
    })
  }

  createRecoverySession(tokenHash: string, attemptId: string, recoveryTokenHash: string, now: number): boolean {
    return this.transaction(() => {
      const auth = this.getAuth()
      if (!auth) return false
      const recovery = this.sqlite.prepare(`
        SELECT token_hash FROM recovery_tokens
        WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      `).get(recoveryTokenHash, now)
      if (!recovery) return false
      this.sqlite.prepare("UPDATE recovery_tokens SET consumed_at = ? WHERE token_hash = ?")
        .run(now, recoveryTokenHash)
      this.insertSession(tokenHash, auth.generation, "recovery", now)
      this.sqlite.prepare("DELETE FROM login_attempts WHERE attempt_id = ?").run(attemptId)
      return true
    })
  }

  private insertSession(
    tokenHash: string,
    generation: number,
    kind: "password" | "recovery",
    now: number,
  ): void {
    this.sqlite.prepare(`
      INSERT INTO sessions(token_hash, created_at, last_seen_at, expires_at, credential_generation, auth_kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tokenHash, now, now, now + 8 * 60 * 60_000, generation, kind)
  }

  /**
   * How this session was authenticated.
   *
   * The column has been written since sessions existed and read by nothing.
   * It matters now: a recovery session is break-glass for someone who has lost
   * the password, and the one thing it must be able to do is fix the
   * credential. Restarting the clinical stack is not that.
   *
   * Returns null for a session that is not valid, so a caller cannot
   * accidentally treat an expired session as a password one.
   */
  sessionKind(tokenHash: string, now: number): "password" | "recovery" | null {
    if (!this.validateSession(tokenHash, now)) return null
    const row = this.sqlite
      .prepare("SELECT auth_kind FROM sessions WHERE token_hash = ?")
      .get(tokenHash) as { auth_kind: string } | undefined
    return row?.auth_kind === "password" || row?.auth_kind === "recovery" ? row.auth_kind : null
  }

  validateSession(tokenHash: string, now: number): boolean {
    return this.transaction(() => {
      const row = this.sqlite.prepare(`
        SELECT s.created_at, s.last_seen_at, s.expires_at, s.credential_generation, a.generation
        FROM sessions s JOIN auth_state a ON a.singleton = 1 WHERE s.token_hash = ?
      `).get(tokenHash) as {
        created_at: number
        last_seen_at: number
        expires_at: number
        credential_generation: number
        generation: number
      } | undefined
      if (!row || row.expires_at <= now || row.last_seen_at + 30 * 60_000 <= now
        || row.credential_generation !== row.generation) {
        this.sqlite.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash)
        return false
      }
      this.sqlite.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, tokenHash)
      return true
    })
  }

  deleteSession(tokenHash: string): void {
    this.sqlite.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash)
  }

  createRecoveryToken(tokenHash: string, expiresAt: number): void {
    this.sqlite.prepare("INSERT INTO recovery_tokens(token_hash, expires_at) VALUES (?, ?)").run(tokenHash, expiresAt)
  }

  private statusAdminRow(adminId: string): StatusAdminRow | null {
    return (this.sqlite.prepare(
      "SELECT * FROM status_admins WHERE id = ?",
    ).get(adminId) as StatusAdminRow | undefined) ?? null
  }

  private statusAdminCredential(row: StatusAdminRow): StatusAdminCredential | null {
    if (row.state !== "ACTIVE" || !row.password_hash) return null
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      generation: row.generation,
      pendingEmail: row.pending_email,
      pendingPasswordHash: row.pending_password_hash,
      pendingGeneration: row.pending_generation,
      pendingTransactionId: row.pending_transaction_id,
      pendingExpiresAt: row.pending_expires_at,
    }
  }

  findStatusAdminForLogin(emailCanonical: string, now: number): StatusAdminCredential | null {
    const row = this.sqlite.prepare(`
      SELECT * FROM status_admins
      WHERE state = 'ACTIVE' AND password_hash IS NOT NULL
        AND (email_canonical = ? OR (
          pending_email_canonical = ? AND pending_password_hash IS NOT NULL
          AND pending_transaction_id IS NOT NULL AND pending_expires_at > ?
        ))
      LIMIT 1
    `).get(emailCanonical, emailCanonical, now) as StatusAdminRow | undefined
    return row ? this.statusAdminCredential(row) : null
  }

  getStatusAdminCredential(adminId: string): StatusAdminCredential | null {
    const row = this.statusAdminRow(adminId)
    return row ? this.statusAdminCredential(row) : null
  }

  listStatusAdmins(now: number): StatusAdminSummary[] {
    const rows = this.sqlite.prepare(`
      SELECT a.id, a.email, a.display_name, a.state, a.is_initial_chief,
        a.created_at, a.activated_at,
        (SELECT MAX(l.expires_at) FROM status_admin_links l
          WHERE l.admin_id = a.id AND l.purpose = 'ACTIVATION'
            AND l.consumed_at IS NULL AND l.expires_at > ?) AS activation_expires_at,
        (SELECT MAX(l.expires_at) FROM status_admin_links l
          WHERE l.admin_id = a.id AND l.purpose = 'RECOVERY'
            AND l.consumed_at IS NULL AND l.expires_at > ?) AS recovery_expires_at
      FROM status_admins a
      ORDER BY a.is_initial_chief DESC, a.display_name COLLATE NOCASE, a.email_canonical
    `).all(now, now) as Array<{
      id: string
      email: string
      display_name: string
      state: StatusAdminState
      is_initial_chief: number
      created_at: number
      activated_at: number | null
      activation_expires_at: number | null
      recovery_expires_at: number | null
    }>
    return rows.map(row => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      state: row.state,
      initialChief: row.is_initial_chief === 1,
      createdAt: row.created_at,
      activatedAt: row.activated_at,
      activeActivationExpiresAt: row.activation_expires_at,
      activeRecoveryExpiresAt: row.recovery_expires_at,
    }))
  }

  private resolveStatusAdminPasswordMatch(
    admin: StatusAdminRow,
    match: PasswordCredentialMatch,
    now: number,
  ): { targetGeneration: number } | null {
    if (admin.id !== match.adminId || admin.state !== "ACTIVE" || !admin.password_hash) return null
    const matchesCurrent = match.kind === "current"
      && admin.email === match.email
      && admin.password_hash === match.passwordHash
      && admin.generation === match.generation
    if (matchesCurrent) return { targetGeneration: admin.generation }
    const matchesPending = match.kind === "pending"
      && admin.generation === match.generation
      && admin.pending_email === match.email
      && admin.pending_password_hash === match.passwordHash
      && admin.pending_generation === match.generation + 1
      && admin.pending_transaction_id === match.transactionId
      && Boolean(admin.pending_expires_at && admin.pending_expires_at > now)
    if (matchesPending) return { targetGeneration: match.generation + 1 }
    const pendingWasCommitted = match.kind === "pending"
      && admin.email === match.email
      && admin.password_hash === match.passwordHash
      && admin.generation === match.generation + 1
    return pendingWasCommitted ? { targetGeneration: admin.generation } : null
  }

  createStatusAdminMfaChallenge(input: {
    tokenHash: string
    attemptId: string
    match: PasswordCredentialMatch
    enrollmentSecretCiphertext: string
    now: number
    expiresAt: number
  }): { targetGeneration: number; enrollmentRequired: boolean } | null {
    return this.transaction(() => {
      const admin = this.statusAdminRow(input.match.adminId)
      if (!admin) return null
      const resolved = this.resolveStatusAdminPasswordMatch(admin, input.match, input.now)
      if (!resolved) return null
      this.sqlite.prepare(`
        DELETE FROM status_admin_mfa_challenges
        WHERE consumed_at IS NOT NULL OR expires_at <= ?
      `).run(input.now)
      const state = this.sqlite.prepare(`
        SELECT credential_generation FROM status_admin_mfa_state
        WHERE admin_id = ? AND credential_generation = ?
      `).get(admin.id, resolved.targetGeneration)
      const enrollmentRequired = !state
      this.sqlite.prepare(`
        INSERT INTO status_admin_mfa_challenges(
          token_hash, admin_id, credential_kind, credential_email,
          credential_password_hash, credential_generation,
          credential_transaction_id, target_generation,
          enrollment_secret_ciphertext, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.tokenHash,
        admin.id,
        input.match.kind,
        input.match.email,
        input.match.passwordHash,
        input.match.generation,
        input.match.transactionId ?? null,
        resolved.targetGeneration,
        enrollmentRequired ? input.enrollmentSecretCiphertext : null,
        input.now,
        input.expiresAt,
      )
      this.sqlite.prepare("DELETE FROM login_attempts WHERE attempt_id = ?").run(input.attemptId)
      return { targetGeneration: resolved.targetGeneration, enrollmentRequired }
    })
  }

  getStatusAdminMfaChallengeMaterial(
    tokenHash: string,
    now: number,
  ): AdminMfaChallengeMaterial | null {
    return this.transaction(() => {
      const challenge = this.sqlite.prepare(`
        SELECT * FROM status_admin_mfa_challenges
        WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      `).get(tokenHash, now) as AdminMfaChallengeRow | undefined
      if (!challenge) return null
      const admin = this.statusAdminRow(challenge.admin_id)
      if (!admin || !this.resolveStatusAdminPasswordMatch(admin, {
        kind: challenge.credential_kind,
        adminId: challenge.admin_id,
        email: challenge.credential_email,
        passwordHash: challenge.credential_password_hash,
        generation: challenge.credential_generation,
        ...(challenge.credential_transaction_id
          ? { transactionId: challenge.credential_transaction_id }
          : {}),
      }, now)) return null
      const state = this.sqlite.prepare(`
        SELECT * FROM status_admin_mfa_state
        WHERE admin_id = ? AND credential_generation = ?
      `).get(challenge.admin_id, challenge.target_generation) as AdminMfaStateRow | undefined
      if (challenge.enrollment_secret_ciphertext) {
        if (state) return null
        return {
          adminId: challenge.admin_id,
          email: challenge.credential_email,
          targetGeneration: challenge.target_generation,
          secretCiphertext: challenge.enrollment_secret_ciphertext,
          enrollmentRequired: true,
          expiresAt: challenge.expires_at,
        }
      }
      if (!state) return null
      return {
        adminId: challenge.admin_id,
        email: challenge.credential_email,
        targetGeneration: challenge.target_generation,
        secretCiphertext: state.secret_ciphertext,
        enrollmentRequired: false,
        expiresAt: challenge.expires_at,
      }
    })
  }

  completeStatusAdminMfaSession(input: {
    challengeHash: string
    sessionHash: string
    attemptId: string
    now: number
    totpStep?: number
    recoveryCodeHash?: string
    enrollmentRecoveryCodeHashes?: readonly string[]
  }): boolean {
    return this.transaction(() => {
      const challenge = this.sqlite.prepare(`
        SELECT * FROM status_admin_mfa_challenges
        WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      `).get(input.challengeHash, input.now) as AdminMfaChallengeRow | undefined
      if (!challenge) return false
      const admin = this.statusAdminRow(challenge.admin_id)
      if (!admin || !this.resolveStatusAdminPasswordMatch(admin, {
        kind: challenge.credential_kind,
        adminId: challenge.admin_id,
        email: challenge.credential_email,
        passwordHash: challenge.credential_password_hash,
        generation: challenge.credential_generation,
        ...(challenge.credential_transaction_id
          ? { transactionId: challenge.credential_transaction_id }
          : {}),
      }, input.now)) return false

      const usesTotp = Number.isInteger(input.totpStep) && input.totpStep! >= 0
      const usesRecovery = Boolean(input.recoveryCodeHash)
      if (usesTotp === usesRecovery) return false
      if (challenge.enrollment_secret_ciphertext) {
        const hashes = input.enrollmentRecoveryCodeHashes
        if (!usesTotp || !hashes || hashes.length !== 10 || new Set(hashes).size !== 10) return false
        const existing = this.sqlite.prepare(`
          SELECT 1 FROM status_admin_mfa_state
          WHERE admin_id = ? AND credential_generation = ?
        `).get(challenge.admin_id, challenge.target_generation)
        if (existing) return false
        this.sqlite.prepare(`
          INSERT INTO status_admin_mfa_state(
            admin_id, credential_generation, secret_ciphertext, enrolled_at, last_totp_step
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          challenge.admin_id,
          challenge.target_generation,
          challenge.enrollment_secret_ciphertext,
          input.now,
          input.totpStep!,
        )
        const insertRecovery = this.sqlite.prepare(`
          INSERT INTO status_admin_mfa_recovery_codes(
            code_hash, admin_id, credential_generation, created_at
          ) VALUES (?, ?, ?, ?)
        `)
        for (const hash of hashes) {
          insertRecovery.run(hash, challenge.admin_id, challenge.target_generation, input.now)
        }
      } else if (usesTotp) {
        const updated = this.sqlite.prepare(`
          UPDATE status_admin_mfa_state SET last_totp_step = ?
          WHERE admin_id = ? AND credential_generation = ?
            AND (last_totp_step IS NULL OR last_totp_step < ?)
        `).run(input.totpStep!, challenge.admin_id, challenge.target_generation, input.totpStep!)
        if (updated.changes !== 1) return false
      } else {
        const consumed = this.sqlite.prepare(`
          UPDATE status_admin_mfa_recovery_codes SET consumed_at = ?
          WHERE code_hash = ? AND admin_id = ? AND credential_generation = ?
            AND consumed_at IS NULL
        `).run(
          input.now,
          input.recoveryCodeHash!,
          challenge.admin_id,
          challenge.target_generation,
        )
        if (consumed.changes !== 1) return false
      }
      const consumedChallenge = this.sqlite.prepare(`
        UPDATE status_admin_mfa_challenges SET consumed_at = ?
        WHERE token_hash = ? AND consumed_at IS NULL
      `).run(input.now, input.challengeHash)
      if (consumedChallenge.changes !== 1) return false
      this.insertStatusAdminSession(
        input.sessionHash,
        challenge.admin_id,
        admin.generation,
        "password",
        input.now,
      )
      this.sqlite.prepare("DELETE FROM login_attempts WHERE attempt_id = ?").run(input.attemptId)
      return true
    })
  }

  private insertStatusAdminSession(
    tokenHash: string,
    adminId: string,
    generation: number,
    kind: "password" | "recovery",
    now: number,
  ): void {
    this.sqlite.prepare(`
      INSERT INTO status_admin_sessions(
        token_hash, admin_id, created_at, last_seen_at, expires_at,
        credential_generation, auth_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tokenHash, adminId, now, now, now + 8 * 60 * 60_000, generation, kind)
  }

  statusAdminSessionPrincipal(tokenHash: string, now: number): StatusSessionPrincipal | null {
    return this.transaction(() => {
      const row = this.sqlite.prepare(`
        SELECT s.admin_id, s.created_at, s.last_seen_at, s.expires_at,
          s.credential_generation, s.auth_kind, a.email, a.display_name,
          a.generation, a.state, a.password_hash
        FROM status_admin_sessions s
        JOIN status_admins a ON a.id = s.admin_id
        WHERE s.token_hash = ?
      `).get(tokenHash) as {
        admin_id: string
        created_at: number
        last_seen_at: number
        expires_at: number
        credential_generation: number
        auth_kind: string
        email: string
        display_name: string
        generation: number
        state: StatusAdminState
        password_hash: string | null
      } | undefined
      const validKind = row?.auth_kind === "password" || row?.auth_kind === "recovery"
      if (!row || !validKind || row.state !== "ACTIVE" || !row.password_hash
        || row.expires_at <= now || row.last_seen_at + 30 * 60_000 <= now
        || row.credential_generation !== row.generation) {
        this.sqlite.prepare("DELETE FROM status_admin_sessions WHERE token_hash = ?").run(tokenHash)
        return null
      }
      this.sqlite.prepare(`
        UPDATE status_admin_sessions SET last_seen_at = ? WHERE token_hash = ?
      `).run(now, tokenHash)
      return {
        adminId: row.admin_id,
        email: row.email,
        displayName: row.display_name,
        generation: row.generation,
        kind: row.auth_kind as "password" | "recovery",
      }
    })
  }

  deleteStatusAdminSession(tokenHash: string): void {
    this.sqlite.prepare("DELETE FROM status_admin_sessions WHERE token_hash = ?").run(tokenHash)
  }

  reserveStatusAdminReauthAttempt(
    attemptId: string,
    adminId: string,
    sessionHash: string,
    now: number,
  ): boolean {
    return this.transaction(() => {
      const cutoff = now - 15 * 60_000
      this.sqlite.prepare(
        "DELETE FROM status_admin_reauth_attempts WHERE occurred_at < ?",
      ).run(cutoff)
      const row = this.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM status_admin_reauth_attempts
        WHERE admin_id = ? AND session_hash = ? AND occurred_at >= ?
      `).get(adminId, sessionHash, cutoff) as { count: number }
      if (row.count >= 5) return false
      this.sqlite.prepare(`
        INSERT INTO status_admin_reauth_attempts(
          attempt_id, admin_id, session_hash, occurred_at
        ) VALUES (?, ?, ?, ?)
      `).run(attemptId, adminId, sessionHash, now)
      return true
    })
  }

  completeStatusAdminReauthAttempt(
    attemptId: string,
    adminId: string,
    sessionHash: string,
    success: boolean,
  ): void {
    this.transaction(() => {
      if (success) {
        this.sqlite.prepare(`
          DELETE FROM status_admin_reauth_attempts
          WHERE admin_id = ? AND session_hash = ?
        `).run(adminId, sessionHash)
      } else {
        this.sqlite.prepare(`
          DELETE FROM status_admin_reauth_attempts
          WHERE attempt_id = ? AND (admin_id <> ? OR session_hash <> ?)
        `).run(attemptId, adminId, sessionHash)
      }
    })
  }

  createStatusAdminConsoleRecoveryToken(tokenHash: string, expiresAt: number): void {
    const chief = this.getAuth()
    if (!chief) throw new StatusAdminStoreError("ADMIN_NOT_FOUND")
    this.sqlite.prepare(`
      INSERT INTO status_admin_console_recovery_tokens(
        token_hash, admin_id, expires_at
      ) VALUES (?, ?, ?)
    `).run(tokenHash, chief.id, expiresAt)
  }

  createStatusAdminConsoleRecoverySession(
    sessionHash: string,
    attemptId: string,
    recoveryTokenHash: string,
    now: number,
  ): boolean {
    return this.transaction(() => {
      const recovery = this.sqlite.prepare(`
        SELECT r.token_hash, r.admin_id, a.generation
        FROM status_admin_console_recovery_tokens r
        JOIN status_admins a ON a.id = r.admin_id
        WHERE r.token_hash = ? AND r.consumed_at IS NULL AND r.expires_at > ?
          AND a.state = 'ACTIVE' AND a.password_hash IS NOT NULL
      `).get(recoveryTokenHash, now) as {
        token_hash: string
        admin_id: string
        generation: number
      } | undefined
      if (!recovery) return false
      const consumed = this.sqlite.prepare(`
        UPDATE status_admin_console_recovery_tokens SET consumed_at = ?
        WHERE token_hash = ? AND consumed_at IS NULL
      `).run(now, recoveryTokenHash)
      if (consumed.changes !== 1) return false
      this.insertStatusAdminSession(
        sessionHash,
        recovery.admin_id,
        recovery.generation,
        "recovery",
        now,
      )
      this.sqlite.prepare("DELETE FROM login_attempts WHERE attempt_id = ?").run(attemptId)
      return true
    })
  }

  private requireActiveStatusAdmin(adminId: string): StatusAdminRow {
    const admin = this.statusAdminRow(adminId)
    if (!admin || admin.state !== "ACTIVE" || !admin.password_hash) {
      throw new StatusAdminStoreError("INVALID_ACTOR")
    }
    return admin
  }

  private statusAdminEmailConflict(emailCanonical: string, exceptId?: string): boolean {
    return Boolean(this.sqlite.prepare(`
      SELECT 1 FROM status_admins
      WHERE (? IS NULL OR id <> ?)
        AND (email_canonical = ? OR pending_email_canonical = ?)
      LIMIT 1
    `).get(exceptId ?? null, exceptId ?? null, emailCanonical, emailCanonical))
  }

  private insertStatusAdminAudit(input: {
    actorAdminId: string | null
    targetAdminId: string
    action: "ADMIN_CREATED" | "ACTIVATION_REISSUED" | "ADMIN_ACTIVATED"
      | "RECOVERY_ISSUED" | "ADMIN_RECOVERED" | "ADMIN_SUSPENDED"
    reason: string
    now: number
  }): void {
    this.sqlite.prepare(`
      INSERT INTO status_admin_audit(
        id, actor_admin_id, target_admin_id, action, reason, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.actorAdminId,
      input.targetAdminId,
      input.action,
      input.reason,
      input.now,
    )
  }

  private invalidateStatusAdminArtifacts(adminId: string, now: number): void {
    this.sqlite.prepare("DELETE FROM status_admin_sessions WHERE admin_id = ?").run(adminId)
    this.sqlite.prepare(`
      UPDATE status_admin_mfa_challenges SET consumed_at = ?
      WHERE admin_id = ? AND consumed_at IS NULL
    `).run(now, adminId)
    this.sqlite.prepare("DELETE FROM status_admin_reauth_attempts WHERE admin_id = ?").run(adminId)
  }

  createPendingStatusAdmin(input: {
    id: string
    email: string
    emailCanonical: string
    displayName: string
    tokenHash: string
    expiresAt: number
    actorAdminId: string
    reason: string
    now: number
  }): void {
    this.transaction(() => {
      this.requireActiveStatusAdmin(input.actorAdminId)
      if (this.statusAdminEmailConflict(input.emailCanonical)) {
        throw new StatusAdminStoreError("ADMIN_ALREADY_EXISTS")
      }
      this.sqlite.prepare(`
        INSERT INTO status_admins(
          id, email, email_canonical, display_name, generation, state,
          is_initial_chief, created_by_admin_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 'PENDING_ACTIVATION', 0, ?, ?, ?)
      `).run(
        input.id,
        input.email,
        input.emailCanonical,
        input.displayName,
        input.actorAdminId,
        input.now,
        input.now,
      )
      this.sqlite.prepare(`
        INSERT INTO status_admin_links(
          token_hash, admin_id, purpose, issued_by_admin_id, created_at, expires_at
        ) VALUES (?, ?, 'ACTIVATION', ?, ?, ?)
      `).run(input.tokenHash, input.id, input.actorAdminId, input.now, input.expiresAt)
      this.insertStatusAdminAudit({
        actorAdminId: input.actorAdminId,
        targetAdminId: input.id,
        action: "ADMIN_CREATED",
        reason: input.reason,
        now: input.now,
      })
    })
  }

  issueStatusAdminLink(input: {
    targetAdminId: string
    purpose: StatusAdminLinkPurpose
    tokenHash: string
    expiresAt: number
    actorAdminId: string
    reason: string
    now: number
  }): void {
    this.transaction(() => {
      this.requireActiveStatusAdmin(input.actorAdminId)
      const target = this.statusAdminRow(input.targetAdminId)
      if (!target) throw new StatusAdminStoreError("ADMIN_NOT_FOUND")
      if (input.purpose === "ACTIVATION") {
        if (target.is_initial_chief === 1) throw new StatusAdminStoreError("PROTECTED_ADMIN")
        if (target.state !== "PENDING_ACTIVATION" && target.state !== "SUSPENDED") {
          throw new StatusAdminStoreError("ADMIN_STATE_INVALID")
        }
        if (target.state === "SUSPENDED") {
          this.sqlite.prepare(`
            UPDATE status_admins SET state = 'PENDING_ACTIVATION', password_hash = NULL,
              suspended_at = NULL, updated_at = ? WHERE id = ?
          `).run(input.now, target.id)
        }
      } else if (target.state !== "ACTIVE" || !target.password_hash) {
        throw new StatusAdminStoreError("ADMIN_STATE_INVALID")
      }
      this.invalidateStatusAdminArtifacts(target.id, input.now)
      this.sqlite.prepare(`
        UPDATE status_admin_links SET consumed_at = ?
        WHERE admin_id = ? AND purpose = ? AND consumed_at IS NULL
      `).run(input.now, target.id, input.purpose)
      this.sqlite.prepare(`
        INSERT INTO status_admin_links(
          token_hash, admin_id, purpose, issued_by_admin_id, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.tokenHash,
        target.id,
        input.purpose,
        input.actorAdminId,
        input.now,
        input.expiresAt,
      )
      this.insertStatusAdminAudit({
        actorAdminId: input.actorAdminId,
        targetAdminId: target.id,
        action: input.purpose === "ACTIVATION" ? "ACTIVATION_REISSUED" : "RECOVERY_ISSUED",
        reason: input.reason,
        now: input.now,
      })
    })
  }

  redeemStatusAdminLink(input: {
    tokenHash: string
    purpose: StatusAdminLinkPurpose
    passwordHash: string
    now: number
  }): { adminId: string; email: string } {
    return this.transaction(() => {
      const row = this.sqlite.prepare(`
        SELECT l.admin_id, l.purpose, l.expires_at, a.email, a.state,
          a.generation, a.activated_at
        FROM status_admin_links l
        JOIN status_admins a ON a.id = l.admin_id
        WHERE l.token_hash = ? AND l.purpose = ? AND l.consumed_at IS NULL
          AND l.expires_at > ?
      `).get(input.tokenHash, input.purpose, input.now) as {
        admin_id: string
        purpose: StatusAdminLinkPurpose
        expires_at: number
        email: string
        state: StatusAdminState
        generation: number
        activated_at: number | null
      } | undefined
      if (!row) throw new StatusAdminStoreError("TOKEN_INVALID")
      const eligible = input.purpose === "ACTIVATION"
        ? row.state === "PENDING_ACTIVATION"
        : row.state === "ACTIVE"
      if (!eligible) throw new StatusAdminStoreError("TOKEN_INVALID")
      const consumed = this.sqlite.prepare(`
        UPDATE status_admin_links SET consumed_at = ?
        WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      `).run(input.now, input.tokenHash, input.now)
      if (consumed.changes !== 1) throw new StatusAdminStoreError("TOKEN_INVALID")
      const generation = input.purpose === "RECOVERY" ? row.generation + 1 : row.generation
      this.sqlite.prepare(`
        UPDATE status_admins SET password_hash = ?, generation = ?, state = 'ACTIVE',
          activated_at = COALESCE(activated_at, ?), suspended_at = NULL,
          pending_email = NULL, pending_email_canonical = NULL,
          pending_password_hash = NULL, pending_generation = NULL,
          pending_transaction_id = NULL, pending_expires_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(input.passwordHash, generation, input.now, input.now, row.admin_id)
      this.invalidateStatusAdminArtifacts(row.admin_id, input.now)
      this.sqlite.prepare(`
        UPDATE status_admin_links SET consumed_at = ?
        WHERE admin_id = ? AND consumed_at IS NULL
      `).run(input.now, row.admin_id)
      this.insertStatusAdminAudit({
        actorAdminId: row.admin_id,
        targetAdminId: row.admin_id,
        action: input.purpose === "ACTIVATION" ? "ADMIN_ACTIVATED" : "ADMIN_RECOVERED",
        reason: input.purpose === "ACTIVATION"
          ? "One-use Status administrator activation completed"
          : "One-use Status administrator recovery completed",
        now: input.now,
      })
      return { adminId: row.admin_id, email: row.email }
    })
  }

  suspendStatusAdmin(input: {
    targetAdminId: string
    actorAdminId: string
    reason: string
    now: number
  }): void {
    this.transaction(() => {
      this.requireActiveStatusAdmin(input.actorAdminId)
      const target = this.statusAdminRow(input.targetAdminId)
      if (!target) throw new StatusAdminStoreError("ADMIN_NOT_FOUND")
      if (target.is_initial_chief === 1) throw new StatusAdminStoreError("PROTECTED_ADMIN")
      if (target.state !== "ACTIVE" || !target.password_hash) {
        throw new StatusAdminStoreError("ADMIN_STATE_INVALID")
      }
      const enabled = (this.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM status_admins
        WHERE state = 'ACTIVE' AND password_hash IS NOT NULL
      `).get() as { count: number }).count
      if (enabled <= 1) throw new StatusAdminStoreError("LAST_ADMIN")
      const changed = this.sqlite.prepare(`
        UPDATE status_admins SET state = 'SUSPENDED', generation = generation + 1,
          suspended_at = ?, updated_at = ?
        WHERE id = ? AND state = 'ACTIVE' AND is_initial_chief = 0
      `).run(input.now, input.now, target.id)
      if (changed.changes !== 1) throw new StatusAdminStoreError("ADMIN_STATE_INVALID")
      this.invalidateStatusAdminArtifacts(target.id, input.now)
      this.sqlite.prepare(`
        UPDATE status_admin_links SET consumed_at = ?
        WHERE admin_id = ? AND consumed_at IS NULL
      `).run(input.now, target.id)
      this.insertStatusAdminAudit({
        actorAdminId: input.actorAdminId,
        targetAdminId: target.id,
        action: "ADMIN_SUSPENDED",
        reason: input.reason,
        now: input.now,
      })
    })
  }

  listStatusAdminAudit(): Array<{
    actorAdminId: string | null
    targetAdminId: string
    action: string
    reason: string
    occurredAt: number
  }> {
    const rows = this.sqlite.prepare(`
      SELECT actor_admin_id, target_admin_id, action, reason, occurred_at
      FROM status_admin_audit ORDER BY occurred_at, rowid
    `).all() as Array<{
      actor_admin_id: string | null
      target_admin_id: string
      action: string
      reason: string
      occurred_at: number
    }>
    return rows.map(row => ({
      actorAdminId: row.actor_admin_id,
      targetAdminId: row.target_admin_id,
      action: row.action,
      reason: row.reason,
      occurredAt: row.occurred_at,
    }))
  }

  recordObservation(observation: CheckObservation): ComponentView {
    const live = this.liveComponents.get(observation.component)
    let stored: ComponentRow | undefined
    if (!live) {
      try {
        stored = this.sqlite.prepare(
          "SELECT * FROM component_state WHERE component = ?",
        ).get(observation.component) as ComponentRow | undefined
      } catch {
        this.historyStorageHealthy = false
      }
    }
    const existingStatus = live?.view.status ?? stored?.status
    const existingChangedAt = live?.view.changedAt ?? stored?.changed_at
    const existingSuccesses = live?.successes ?? stored?.consecutive_successes ?? 0
    const existingFailures = live?.failures ?? stored?.consecutive_failures ?? 0
    let status = existingStatus ?? "unknown"
    const successes = observation.status === "operational" ? existingSuccesses + 1 : 0
    const failures = observation.status === "degraded" || observation.status === "outage"
      ? existingFailures + 1
      : 0

    if (observation.status === "not-configured") {
      status = "not-configured"
    } else if (observation.status === "unknown") {
      status = "unknown"
    } else if (observation.status === "operational") {
      if (!existingStatus || existingStatus === "unknown" || existingStatus === "not-configured" || successes >= 2) {
        status = "operational"
      }
    } else if (failures >= 3) {
      status = observation.status
    }

    const changed = !existingStatus || existingStatus !== status
    const changedAt = changed ? observation.checkedAt : (existingChangedAt ?? observation.checkedAt)
    const view: ComponentView = {
      ...observation,
      status,
      observedStatus: observation.status,
      changedAt,
    }
    this.liveComponents.set(observation.component, { view, successes, failures })
    if (this.liveComponents.size > 64) {
      const oldest = [...this.liveComponents.entries()]
        .sort((left, right) => left[1].view.checkedAt - right[1].view.checkedAt)[0]?.[0]
      if (oldest) this.liveComponents.delete(oldest)
    }

    try {
      this.transaction(() => {
        this.sqlite.prepare(`
          INSERT INTO component_state(
            component, label, group_name, status, observed_status, detail_code,
            consecutive_successes, consecutive_failures, last_checked_at, changed_at, latency_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(component) DO UPDATE SET label=excluded.label, group_name=excluded.group_name,
            status=excluded.status, observed_status=excluded.observed_status, detail_code=excluded.detail_code,
            consecutive_successes=excluded.consecutive_successes,
            consecutive_failures=excluded.consecutive_failures, last_checked_at=excluded.last_checked_at,
            changed_at=excluded.changed_at, latency_ms=excluded.latency_ms
        `).run(
          observation.component, observation.label, observation.group, status,
          observation.status, observation.code, successes, failures, observation.checkedAt,
          changedAt, observation.latencyMs ?? null,
        )
        const bucketAt = Math.floor(observation.checkedAt / 300_000) * 300_000
        this.sqlite.prepare(`
          INSERT INTO availability_samples(
            component, checked_at, status, status_rank, detail_code, latency_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(component, checked_at) DO UPDATE SET
            status = CASE WHEN excluded.status_rank >= availability_samples.status_rank
              THEN excluded.status ELSE availability_samples.status END,
            status_rank = MAX(availability_samples.status_rank, excluded.status_rank),
            detail_code = CASE WHEN excluded.status_rank >= availability_samples.status_rank
              THEN excluded.detail_code ELSE availability_samples.detail_code END,
            latency_ms = CASE WHEN excluded.status_rank >= availability_samples.status_rank
              THEN excluded.latency_ms ELSE availability_samples.latency_ms END
        `).run(
          observation.component, bucketAt, observation.status, STATUS_RANK[observation.status],
          observation.code, observation.latencyMs ?? null,
        )

        const hasOpenIncident = Boolean(this.sqlite.prepare(
          "SELECT 1 FROM incidents WHERE component = ? AND resolved_at IS NULL LIMIT 1",
        ).get(observation.component))
        if ((status === "degraded" || status === "outage") && !hasOpenIncident) {
          this.sqlite.prepare(`
            INSERT INTO incidents(id, component, label, opened_at, opening_status, code)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(randomUUID(), observation.component, observation.label, observation.checkedAt, status, observation.code)
        } else if ((status === "operational" || status === "not-configured") && hasOpenIncident) {
          this.sqlite.prepare(`
            UPDATE incidents SET resolved_at = ? WHERE component = ? AND resolved_at IS NULL
          `).run(observation.checkedAt, observation.component)
        }
      })
      this.historyStorageHealthy = true
    } catch {
      this.historyStorageHealthy = false
    }
    return view
  }

  insertEvent(event: {
    id: string
    producer: string
    occurredAt: number
    code: string
    severity: string
    message: string
    facts: Record<string, boolean | number | string>
  }): boolean | null {
    if (this.liveEvents.has(event.id)) return false
    const liveEvent: OperationalEventView = {
      id: event.id,
      producer: event.producer,
      occurredAt: event.occurredAt,
      code: event.code,
      severity: event.severity as OperationalEventView["severity"],
      message: event.message,
    }
    try {
      const result = this.sqlite.prepare(`
        INSERT OR IGNORE INTO operational_events(
          id, producer, occurred_at, code, severity, message, facts_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.id, event.producer, event.occurredAt, event.code, event.severity,
        event.message, JSON.stringify(event.facts),
      )
      if (result.changes !== 1) return false
    } catch {
      this.historyStorageHealthy = false
      return null
    }
    // SQLite is authoritative when it is available. Remember the incoming
    // value only after a successful insert, so a replay cannot temporarily
    // replace the original event on the live dashboard.
    this.liveEvents.set(event.id, liveEvent)
    if (this.liveEvents.size > 50) {
      const oldest = [...this.liveEvents.values()]
        .sort((left, right) => left.occurredAt - right.occurredAt)[0]
      if (oldest) this.liveEvents.delete(oldest.id)
    }
    return true
  }

  cacheSnapshot(snapshot: ApplianceSnapshot, receivedAt: number): void {
    this.liveSnapshot = { snapshot, receivedAt }
    try {
      this.sqlite.prepare(`
        INSERT INTO snapshot_cache(singleton, snapshot_json, received_at) VALUES (1, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET snapshot_json=excluded.snapshot_json, received_at=excluded.received_at
      `).run(JSON.stringify(snapshot), receivedAt)
    } catch {
      this.historyStorageHealthy = false
    }
  }

  getSnapshot(): { snapshot: ApplianceSnapshot; receivedAt: number } | null {
    if (this.liveSnapshot) return this.liveSnapshot
    try {
      const row = this.sqlite.prepare(
        "SELECT snapshot_json, received_at FROM snapshot_cache WHERE singleton = 1",
      ).get() as { snapshot_json: string; received_at: number } | undefined
      if (!row) return null
      const snapshot = safeJsonParse(row.snapshot_json)
      if (!snapshot) return null
      this.liveSnapshot = { snapshot: snapshot as ApplianceSnapshot, receivedAt: row.received_at }
      return this.liveSnapshot
    } catch {
      this.historyStorageHealthy = false
      return null
    }
  }

  getDashboard(now = Date.now()): DashboardData {
    let storedComponents: ComponentView[] = []
    let incidents: IncidentView[] = []
    let events: OperationalEventView[] = []
    try {
      storedComponents = this.sqlite.prepare(`
        SELECT component, label, group_name, status, observed_status, detail_code,
          last_checked_at, changed_at, latency_ms FROM component_state
        ORDER BY CASE group_name WHEN 'clinical' THEN 0 WHEN 'research' THEN 1 ELSE 2 END, label
      `).all().map(row => {
        const value = row as Omit<ComponentRow, "consecutive_successes" | "consecutive_failures">
        return {
          component: value.component,
          label: value.label,
          group: value.group_name,
          status: value.status,
          observedStatus: value.observed_status,
          code: value.detail_code,
          checkedAt: value.last_checked_at,
          changedAt: value.changed_at,
          ...(value.latency_ms === null ? {} : { latencyMs: value.latency_ms }),
        } satisfies ComponentView
      })
      incidents = this.sqlite.prepare(`
        SELECT id, component, label, opened_at, resolved_at, opening_status, code
        FROM incidents ORDER BY opened_at DESC LIMIT 50
      `).all().map(row => {
      const value = row as {
        id: string; component: string; label: string; opened_at: number
        resolved_at: number | null; opening_status: ComponentStatus; code: string
      }
      return {
        id: value.id,
        component: value.component,
        label: value.label,
        openedAt: value.opened_at,
        resolvedAt: value.resolved_at,
        openingStatus: value.opening_status,
        code: value.code,
      } satisfies IncidentView
      })
      events = this.sqlite.prepare(`
        SELECT id, producer, occurred_at, code, severity, message
        FROM operational_events ORDER BY occurred_at DESC LIMIT 50
      `).all().map(row => {
      const value = row as {
        id: string; producer: string; occurred_at: number; code: string
        severity: "info" | "warning" | "critical"; message: string
      }
      return {
        id: value.id,
        producer: value.producer,
        occurredAt: value.occurred_at,
        code: value.code,
        severity: value.severity,
        message: value.message,
      } satisfies OperationalEventView
      })
    } catch {
      this.historyStorageHealthy = false
    }
    const componentMap = new Map(storedComponents.map(item => [item.component, item]))
    for (const [component, current] of this.liveComponents) componentMap.set(component, current.view)
    const historyComponent: ComponentView = {
      component: "status-history",
      label: "Status history storage",
      group: "safety",
      status: this.historyStorageHealthy ? "operational" : "degraded",
      observedStatus: this.historyStorageHealthy ? "operational" : "degraded",
      code: this.historyStorageHealthy ? "STATUS_HISTORY_AVAILABLE" : "STATUS_HISTORY_UNAVAILABLE",
      checkedAt: now,
      changedAt: now,
    }
    componentMap.set("status-history", historyComponent)
    const components = [...componentMap.values()].sort((left, right) => {
      const groupRank = { clinical: 0, research: 1, safety: 2 }
      return groupRank[left.group] - groupRank[right.group] || left.label.localeCompare(right.label)
    })
    const eventMap = new Map(events.map(item => [item.id, item]))
    for (const [id, event] of this.liveEvents) eventMap.set(id, event)
    events = [...eventMap.values()].sort((left, right) => right.occurredAt - left.occurredAt).slice(0, 50)
    const histories: Record<string, DayStatus[]> = {}
    for (const component of components) {
      try {
        histories[component.component] = this.history(component.component, now)
      } catch {
        this.historyStorageHealthy = false
        histories[component.component] = []
      }
    }
    if (!this.historyStorageHealthy) {
      historyComponent.status = "degraded"
      historyComponent.observedStatus = "degraded"
      historyComponent.code = "STATUS_HISTORY_UNAVAILABLE"
    }
    const cached = this.getSnapshot()
    return {
      components,
      incidents,
      events,
      histories,
      lastCheckedAt: components.some(item => item.component !== "status-history")
        ? Math.max(...components.filter(item => item.component !== "status-history").map(item => item.checkedAt))
        : null,
      snapshot: cached?.snapshot ?? null,
      snapshotReceivedAt: cached?.receivedAt ?? null,
    }
  }

  private history(component: string, now: number): DayStatus[] {
    const days = new Map<string, ComponentStatus>()
    const dailyRows = this.sqlite.prepare(`
      SELECT day, status FROM availability_daily WHERE component = ? AND day >= date(?, 'unixepoch', '-89 days')
    `).all(component, Math.floor(now / 1000)) as Array<{ day: string; status: ComponentStatus }>
    for (const row of dailyRows) days.set(row.day, row.status)
    const sampleRows = this.sqlite.prepare(`
      SELECT checked_at, status FROM availability_samples WHERE component = ? AND checked_at >= ?
    `).all(component, now - 90 * 86_400_000) as Array<{ checked_at: number; status: ComponentStatus }>
    for (const row of sampleRows) {
      const day = dayKey(row.checked_at)
      const current = days.get(day)
      if (!current || STATUS_RANK[row.status] > STATUS_RANK[current]) days.set(day, row.status)
    }
    const result: DayStatus[] = []
    for (let offset = 89; offset >= 0; offset -= 1) {
      const day = dayKey(now - offset * 86_400_000)
      result.push({ day, status: days.get(day) ?? "unknown" })
    }
    return result
  }

  retain(now = Date.now()): void {
    const detailedCutoff = now - 30 * 86_400_000
    const authSecurityCutoff = now - 90 * 86_400_000
    const summaryCutoff = dayKey(now - 365 * 86_400_000)
    try {
      this.transaction(() => {
        const oldRows = this.sqlite.prepare(`
          SELECT component, checked_at, status FROM availability_samples WHERE checked_at < ?
        `).all(detailedCutoff) as Array<{ component: string; checked_at: number; status: ComponentStatus }>
        const worst = new Map<string, ComponentStatus>()
        for (const row of oldRows) {
          const key = `${row.component}\u0000${dayKey(row.checked_at)}`
          const current = worst.get(key)
          if (!current || STATUS_RANK[row.status] > STATUS_RANK[current]) worst.set(key, row.status)
        }
        const statement = this.sqlite.prepare(`
          INSERT INTO availability_daily(component, day, status) VALUES (?, ?, ?)
          ON CONFLICT(component, day) DO UPDATE SET status = CASE
            WHEN (CASE excluded.status
              WHEN 'operational' THEN 0 WHEN 'not-configured' THEN 1 WHEN 'unknown' THEN 2
              WHEN 'degraded' THEN 3 WHEN 'outage' THEN 4 ELSE 4 END)
              > (CASE availability_daily.status
                WHEN 'operational' THEN 0 WHEN 'not-configured' THEN 1 WHEN 'unknown' THEN 2
                WHEN 'degraded' THEN 3 WHEN 'outage' THEN 4 ELSE 4 END)
            THEN excluded.status ELSE availability_daily.status END
        `)
        for (const [key, status] of worst) {
          const [component, day] = key.split("\u0000")
          statement.run(component, day, status)
        }
        this.sqlite.prepare("DELETE FROM availability_samples WHERE checked_at < ?").run(detailedCutoff)
        this.sqlite.prepare(`
          DELETE FROM operational_events
          WHERE (producer <> 'status-auth' AND occurred_at < ?)
             OR (producer = 'status-auth' AND occurred_at < ?)
        `).run(detailedCutoff, authSecurityCutoff)
        this.sqlite.prepare("DELETE FROM availability_daily WHERE day < ?").run(summaryCutoff)
        this.sqlite.prepare("DELETE FROM incidents WHERE opened_at < ? AND resolved_at IS NOT NULL").run(
          now - 365 * 86_400_000,
        )
        this.sqlite.prepare("DELETE FROM login_failures WHERE occurred_at < ?").run(now - 15 * 60_000)
        this.sqlite.prepare("DELETE FROM login_attempts WHERE occurred_at < ?").run(now - 15 * 60_000)
        this.sqlite.prepare("DELETE FROM recovery_tokens WHERE expires_at < ? OR consumed_at IS NOT NULL").run(now)
        this.sqlite.prepare("DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?").run(now, now - 30 * 60_000)
        this.sqlite.prepare(`
          DELETE FROM operational_events WHERE id NOT IN (
            SELECT id FROM operational_events ORDER BY occurred_at DESC LIMIT 10000
          )
        `).run()
        this.sqlite.prepare(`
          DELETE FROM availability_samples WHERE rowid NOT IN (
            SELECT rowid FROM availability_samples ORDER BY checked_at DESC LIMIT 250000
          )
        `).run()
        this.sqlite.prepare(`
          DELETE FROM incidents WHERE id NOT IN (
            SELECT id FROM incidents ORDER BY opened_at DESC LIMIT 10000
          ) AND resolved_at IS NOT NULL
        `).run()
      })
      for (const [id, event] of this.liveEvents) {
        const cutoff = event.producer === "status-auth" ? authSecurityCutoff : detailedCutoff
        if (event.occurredAt < cutoff) this.liveEvents.delete(id)
      }
      this.historyStorageHealthy = true
    } catch {
      this.historyStorageHealthy = false
    }
  }
}
