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

type AuthRow = {
  email: string
  password_hash: string
  generation: number
  pending_email: string | null
  pending_password_hash: string | null
  pending_generation: number | null
  pending_transaction_id: string | null
  pending_expires_at: number | null
}

type PasswordCredentialMatch = {
  kind: "current" | "pending"
  email: string
  passwordHash: string
  generation: number
  transactionId?: string
}

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
      CREATE TABLE IF NOT EXISTS recovery_tokens (
        token_hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
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
    return (this.sqlite.prepare("SELECT * FROM auth_state WHERE singleton = 1").get() as AuthRow | undefined) ?? null
  }

  initializeAuth(email: string, passwordHash: string, generation: number, now: number): void {
    this.sqlite.prepare(`
      INSERT INTO auth_state(singleton, email, password_hash, generation, created_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?)
    `).run(email, passwordHash, generation, now, now)
  }

  setPendingAuth(
    email: string,
    passwordHash: string,
    generation: number,
    transactionId: string,
    expiresAt: number,
    now: number,
  ): void {
    this.sqlite.prepare(`
      UPDATE auth_state SET pending_email = ?, pending_password_hash = ?, pending_generation = ?,
        pending_transaction_id = ?, pending_expires_at = ?, updated_at = ? WHERE singleton = 1
    `).run(email, passwordHash, generation, transactionId, expiresAt, now)
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
        UPDATE auth_state SET email = pending_email, password_hash = pending_password_hash,
          generation = pending_generation, pending_email = NULL, pending_password_hash = NULL,
          pending_generation = NULL, pending_transaction_id = NULL, pending_expires_at = NULL,
          updated_at = ? WHERE singleton = 1
      `).run(now)
      this.sqlite.prepare("DELETE FROM sessions").run()
      return auth.pending_generation
    })
  }

  abortPendingAuth(transactionId: string, now: number): void {
    this.transaction(() => {
      const result = this.sqlite.prepare(`
        UPDATE auth_state SET pending_email = NULL, pending_password_hash = NULL,
          pending_generation = NULL, pending_transaction_id = NULL, pending_expires_at = NULL,
          updated_at = ? WHERE singleton = 1 AND pending_transaction_id = ?
      `).run(now, transactionId)
      if (result.changes !== 1) throw new Error("No matching pending credential change")
      // A pending credential is allowed to sign in while a coordinated rotation
      // is in flight. Abort must therefore invalidate every session, including
      // any session created with the credential that has just been abandoned.
      this.sqlite.prepare("DELETE FROM sessions").run()
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

  createPasswordSession(
    tokenHash: string,
    attemptId: string,
    match: PasswordCredentialMatch,
    now: number,
  ): boolean {
    return this.transaction(() => {
      const auth = this.getAuth()
      if (!auth) return false
      const matchesCurrent = auth.email === match.email
        && auth.password_hash === match.passwordHash
        && auth.generation === match.generation
      const matchesPending = match.kind === "pending"
        && auth.generation === match.generation
        && auth.pending_email === match.email
        && auth.pending_password_hash === match.passwordHash
        && auth.pending_generation === match.generation + 1
        && auth.pending_transaction_id === match.transactionId
        && Boolean(auth.pending_expires_at && auth.pending_expires_at > now)
      // If commit won the race after bcrypt completed, the former pending
      // credential is now the active credential and is safe to accept.
      const pendingWasCommitted = match.kind === "pending"
        && auth.email === match.email
        && auth.password_hash === match.passwordHash
        && auth.generation === match.generation + 1
      const valid = match.kind === "current" ? matchesCurrent : matchesPending || pendingWasCommitted
      if (!valid) return false
      this.insertSession(tokenHash, auth.generation, "password", now)
      this.sqlite.prepare("DELETE FROM login_attempts WHERE attempt_id = ?").run(attemptId)
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
