import { Socket } from "node:net"
import { Client } from "pg"
import type { StatusConfig } from "./config.js"
import type { StatusDatabase } from "./db.js"
import type { CheckObservation, ComponentGroup } from "./types.js"
import { parseApplianceSnapshot, snapshotIsFresh, snapshotObservations } from "./snapshot.js"
import { readSignalObservations } from "./signals.js"
import { hmacSha256, normalizeEmail, safeJsonParse } from "./util.js"

type HttpTarget = {
  component: string
  label: string
  group: ComponentGroup
  url: string | null
}

function elapsedMs(start: bigint): number {
  return Math.max(0, Number((process.hrtime.bigint() - start) / 1_000_000n))
}

async function httpProbe(target: HttpTarget, timeoutMs: number, now: number): Promise<CheckObservation> {
  if (!target.url) {
    return { ...target, status: "unknown", code: "PROBE_NOT_CONFIGURED", checkedAt: now }
  }
  const start = process.hrtime.bigint()
  try {
    const response = await fetch(target.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "lospor-status/1" },
    })
    const latencyMs = elapsedMs(start)
    if (response.status >= 200 && response.status < 400) {
      return { ...target, status: "operational", code: "HTTP_REACHABLE", checkedAt: now, latencyMs }
    }
    return { ...target, status: "outage", code: "HTTP_UNHEALTHY", checkedAt: now, latencyMs }
  } catch {
    return { ...target, status: "outage", code: "HTTP_UNREACHABLE", checkedAt: now, latencyMs: elapsedMs(start) }
  }
}

async function tcpProbe(
  component: string,
  label: string,
  group: ComponentGroup,
  host: string | null,
  port: number,
  timeoutMs: number,
  now: number,
): Promise<CheckObservation> {
  if (!host) return { component, label, group, status: "unknown", code: "PROBE_NOT_CONFIGURED", checkedAt: now }
  const start = process.hrtime.bigint()
  const reached = await new Promise<boolean>(resolve => {
    const socket = new Socket()
    let settled = false
    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
    socket.connect(port, host)
  })
  return {
    component,
    label,
    group,
    status: reached ? "operational" : "outage",
    code: reached ? "TCP_REACHABLE" : "TCP_UNREACHABLE",
    checkedAt: now,
    latencyMs: elapsedMs(start),
  }
}

async function postgresProbe(config: StatusConfig, now: number): Promise<CheckObservation> {
  const base = { component: "database", label: "Clinical database", group: "clinical" as const, checkedAt: now }
  if (config.databaseHealthUrl) {
    const fixtureResult = await httpProbe({ ...base, url: config.databaseHealthUrl }, config.probeTimeoutMs, now)
    return {
      ...fixtureResult,
      code: fixtureResult.status === "operational" ? "DATABASE_REACHABLE" : "DATABASE_UNREACHABLE",
    }
  }
  if (!config.postgresHost || !config.postgresPassword) {
    return { ...base, status: "unknown", code: "DATABASE_PROBE_NOT_CONFIGURED" }
  }
  const start = process.hrtime.bigint()
  const client = new Client({
    host: config.postgresHost,
    port: config.postgresPort,
    database: config.postgresDatabase,
    user: config.postgresUser,
    password: config.postgresPassword,
    connectionTimeoutMillis: config.probeTimeoutMs,
    query_timeout: config.probeTimeoutMs,
    statement_timeout: config.probeTimeoutMs,
    application_name: "lospor-status-probe",
  })
  try {
    await client.connect()
    const result = await client.query<{ available: number }>("SELECT 1 AS available")
    const healthy = result.rows[0]?.available === 1
    return {
      ...base,
      status: healthy ? "operational" : "outage",
      code: healthy ? "DATABASE_REACHABLE" : "DATABASE_INVALID_RESPONSE",
      latencyMs: elapsedMs(start),
    }
  } catch {
    return { ...base, status: "outage", code: "DATABASE_UNREACHABLE", latencyMs: elapsedMs(start) }
  } finally {
    await client.end().catch(() => undefined)
  }
}

const SNAPSHOT_COMPONENTS = [
  ["migrations", "Database migrations", "safety"],
  ["research-storage", "Research export storage", "safety"],
  ["email", "Appliance email", "safety"],
  ["central", "Central delivery", "research"],
  ["research-exports", "Research exports", "research"],
  ["operator-credentials", "Appliance administrator credentials", "safety"],
] as const

function unavailableSnapshotObservations(now: number): CheckObservation[] {
  return SNAPSHOT_COMPONENTS.map(([component, label, group]) => ({
    component,
    label,
    group,
    status: "unknown",
    code: "APPLIANCE_SNAPSHOT_UNAVAILABLE",
    checkedAt: now,
  }))
}

export function operatorCredentialStatus(
  auth: { email: string; generation: number } | null,
  snapshot: { operatorCredentialGeneration: number; operatorCredentialIdentityProof: string | null },
  snapshotToken: string,
): "operational" | "degraded" | "unknown" {
  if (!auth || !snapshot.operatorCredentialIdentityProof) return "unknown"
  const expectedIdentityProof = hmacSha256(
    Buffer.from(snapshotToken, "utf8"),
    `operator-email-v1\u0000${normalizeEmail(auth.email)}`,
  )
  return auth.generation === snapshot.operatorCredentialGeneration
      && expectedIdentityProof === snapshot.operatorCredentialIdentityProof
    ? "operational"
    : "degraded"
}

async function snapshotProbe(
  config: StatusConfig,
  db: StatusDatabase,
  now: number,
): Promise<CheckObservation[]> {
  if (!config.snapshotUrl || !config.snapshotToken) return unavailableSnapshotObservations(now)
  try {
    const response = await fetch(config.snapshotUrl, {
      signal: AbortSignal.timeout(config.probeTimeoutMs),
      headers: {
        authorization: `Bearer ${config.snapshotToken}`,
        accept: "application/json",
        "user-agent": "lospor-status/1",
      },
    })
    if (!response.ok) return unavailableSnapshotObservations(now)
    const text = await response.text()
    if (Buffer.byteLength(text) > 64 * 1024) return unavailableSnapshotObservations(now)
    const snapshot = parseApplianceSnapshot(safeJsonParse(text))
    if (!snapshot || !snapshotIsFresh(snapshot, now)) return unavailableSnapshotObservations(now)
    db.cacheSnapshot(snapshot, now)
    const auth = db.getAuth()
    const credentialStatus = operatorCredentialStatus(auth, snapshot, config.snapshotToken)
    return [
      ...snapshotObservations(snapshot, now),
      {
        component: "operator-credentials",
        label: "Appliance administrator credentials",
        group: "safety",
        status: credentialStatus,
        code: credentialStatus === "operational"
          ? "OPERATOR_CREDENTIALS_SYNCHRONIZED"
          : credentialStatus === "degraded"
            ? "OPERATOR_CREDENTIALS_DIVERGED"
            : "OPERATOR_CREDENTIALS_UNKNOWN",
        checkedAt: now,
      },
    ]
  } catch {
    return unavailableSnapshotObservations(now)
  }
}

async function apiProbe(config: StatusConfig, now: number): Promise<CheckObservation> {
  const [live, ready] = await Promise.all([
    httpProbe({
      component: "api-live",
      label: "Clinical API liveness",
      group: "clinical",
      url: config.apiLiveUrl,
    }, config.probeTimeoutMs, now),
    httpProbe({
      component: "api-ready",
      label: "Clinical API readiness",
      group: "clinical",
      url: config.apiReadyUrl,
    }, config.probeTimeoutMs, now),
  ])
  const latencyMs = Math.max(live.latencyMs ?? 0, ready.latencyMs ?? 0)
  if (live.status === "unknown" || ready.status === "unknown") {
    return {
      component: "api", label: "Clinical API", group: "clinical", status: "unknown",
      code: "API_PROBE_NOT_CONFIGURED", checkedAt: now, latencyMs,
    }
  }
  if (live.status !== "operational") {
    return {
      component: "api", label: "Clinical API", group: "clinical", status: "outage",
      code: "API_NOT_LIVE", checkedAt: now, latencyMs,
    }
  }
  if (ready.status !== "operational") {
    return {
      component: "api", label: "Clinical API", group: "clinical", status: "degraded",
      code: "API_NOT_READY", checkedAt: now, latencyMs,
    }
  }
  return {
    component: "api", label: "Clinical API", group: "clinical", status: "operational",
    code: "API_READY", checkedAt: now, latencyMs,
  }
}

export class StatusMonitor {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly config: StatusConfig,
    private readonly db: StatusDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    if (this.timer) return
    void this.runOnce().catch(() => undefined)
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), this.config.checkIntervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async runOnce(): Promise<void> {
    if (this.running) return
    this.running = true
    const now = this.now()
    try {
      // Resolve the independent user-facing services first. When API and
      // Postgres are both absent, their concurrent Docker-DNS lookups can fill
      // Node's resolver worker pool until the probe deadline. Starting every
      // probe together then falsely reports healthy Web/PWA/Browser services
      // as unavailable—the exact outage this monitor exists to distinguish.
      const [web, pwa, browser, caddy, signals] = await Promise.all([
        httpProbe({ component: "web", label: "Clinical Web", group: "clinical", url: this.config.webUrl }, this.config.probeTimeoutMs, now),
        httpProbe({ component: "pwa", label: "Clinical PWA", group: "clinical", url: this.config.pwaUrl }, this.config.probeTimeoutMs, now),
        httpProbe({ component: "browser", label: "Research Browser", group: "research", url: this.config.browserUrl }, this.config.probeTimeoutMs, now),
        this.config.caddyHealthUrl
          ? httpProbe({
            component: "proxy",
            label: "Appliance gateway",
            group: "clinical",
            url: this.config.caddyHealthUrl,
          }, this.config.probeTimeoutMs, now)
          : tcpProbe("proxy", "Appliance gateway", "clinical", this.config.caddyHost, this.config.caddyPort, this.config.probeTimeoutMs, now),
        readSignalObservations(this.config.signalsDir, now),
      ])
      const [api, postgres, snapshot] = await Promise.all([
        apiProbe(this.config, now),
        postgresProbe(this.config, now),
        snapshotProbe(this.config, this.db, now),
      ])
      for (const observation of [api, web, pwa, browser, caddy, postgres, ...signals, ...snapshot]) {
        this.db.recordObservation(observation)
      }
      this.db.retain(now)
    } finally {
      this.running = false
    }
  }
}
