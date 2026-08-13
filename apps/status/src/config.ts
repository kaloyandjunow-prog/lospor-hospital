import { readFileSync } from "node:fs"
import { isRecord, safeJsonParse } from "./util.js"

export type StatusConfig = {
  databasePath: string
  basePath: "/status"
  httpPort: number
  httpsPort: number
  tlsCertFile: string | null
  tlsKeyFile: string | null
  eventTokens: ReadonlyMap<string, string>
  rateLimitKey: Buffer
  snapshotToken: string | null
  signalsDir: string
  apiLiveUrl: string | null
  apiReadyUrl: string | null
  snapshotUrl: string | null
  webUrl: string | null
  pwaUrl: string | null
  browserUrl: string | null
  caddyHost: string | null
  caddyPort: number
  caddyHealthUrl: string | null
  postgresHost: string | null
  postgresPort: number
  postgresDatabase: string
  postgresUser: string
  postgresPassword: string | null
  databaseHealthUrl: string | null
  checkIntervalMs: number
  probeTimeoutMs: number
}

function integerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function optionalUrl(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name]?.trim()
  if (!raw) return null
  const url = new URL(raw)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`)
  }
  return url.toString()
}

function readSecretFile(
  env: NodeJS.ProcessEnv,
  name: string,
  minimumLength: number,
  required = false,
): string | null {
  const path = env[name]?.trim()
  if (!path) {
    if (required) throw new Error(`${name} is required`)
    return null
  }
  let value: string
  try {
    value = readFileSync(path, "utf8").trim()
  } catch {
    throw new Error(`${name} could not be read`)
  }
  if (value.length < minimumLength || value.length > 8192) {
    throw new Error(`${name} has an invalid length`)
  }
  return value
}

function loadEventTokens(env: NodeJS.ProcessEnv): ReadonlyMap<string, string> {
  const raw = readSecretFile(env, "STATUS_EVENT_TOKENS_FILE", 2)
  if (!raw) return new Map()
  const value = safeJsonParse(raw)
  if (!isRecord(value)) throw new Error("STATUS_EVENT_TOKENS_FILE must contain a JSON object")
  const tokens = new Map<string, string>()
  for (const [producer, token] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(producer)
      || typeof token !== "string"
      || token.length < 24
      || token.length > 512) {
      throw new Error("STATUS_EVENT_TOKENS_FILE contains an invalid producer or token")
    }
    tokens.set(producer, token)
  }
  return tokens
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): StatusConfig {
  const basePath = env.STATUS_BASE_PATH?.trim() || "/status"
  if (basePath !== "/status") {
    throw new Error("STATUS_BASE_PATH must be /status")
  }

  const tlsCertFile = env.STATUS_TLS_CERT_FILE?.trim() || null
  const tlsKeyFile = env.STATUS_TLS_KEY_FILE?.trim() || null
  if (Boolean(tlsCertFile) !== Boolean(tlsKeyFile)) {
    throw new Error("Both STATUS_TLS_CERT_FILE and STATUS_TLS_KEY_FILE are required for fallback TLS")
  }

  const rateLimitKey = readSecretFile(env, "STATUS_RATE_LIMIT_KEY_FILE", 32, true)
  const postgresPassword = readSecretFile(env, "STATUS_POSTGRES_PASSWORD_FILE", 1)

  return {
    databasePath: env.STATUS_DATABASE_PATH?.trim() || "/data/status.sqlite",
    basePath: "/status",
    httpPort: integerEnv(env, "STATUS_HTTP_PORT", 3004, 1, 65_535),
    httpsPort: integerEnv(env, "STATUS_HTTPS_PORT", 3443, 1, 65_535),
    tlsCertFile,
    tlsKeyFile,
    eventTokens: loadEventTokens(env),
    rateLimitKey: Buffer.from(rateLimitKey!, "utf8"),
    snapshotToken: readSecretFile(env, "STATUS_SNAPSHOT_TOKEN_FILE", 24),
    signalsDir: env.STATUS_SIGNALS_DIR?.trim() || "/signals",
    apiLiveUrl: optionalUrl(env, "STATUS_API_LIVE_URL"),
    apiReadyUrl: optionalUrl(env, "STATUS_API_READY_URL"),
    snapshotUrl: optionalUrl(env, "STATUS_APPLIANCE_SNAPSHOT_URL"),
    webUrl: optionalUrl(env, "STATUS_WEB_URL"),
    pwaUrl: optionalUrl(env, "STATUS_PWA_URL"),
    browserUrl: optionalUrl(env, "STATUS_BROWSER_URL"),
    caddyHost: env.STATUS_CADDY_HOST?.trim() || null,
    caddyPort: integerEnv(env, "STATUS_CADDY_PORT", 80, 1, 65_535),
    caddyHealthUrl: optionalUrl(env, "STATUS_CADDY_HEALTH_URL"),
    postgresHost: env.STATUS_POSTGRES_HOST?.trim() || null,
    postgresPort: integerEnv(env, "STATUS_POSTGRES_PORT", 5432, 1, 65_535),
    postgresDatabase: env.STATUS_POSTGRES_DATABASE?.trim() || "lospor",
    postgresUser: env.STATUS_POSTGRES_USER?.trim() || "lospor_status_probe",
    postgresPassword,
    databaseHealthUrl: optionalUrl(env, "STATUS_DATABASE_HEALTH_URL"),
    checkIntervalMs: integerEnv(env, "STATUS_CHECK_INTERVAL_MS", 15_000, 5_000, 300_000),
    probeTimeoutMs: integerEnv(env, "STATUS_PROBE_TIMEOUT_MS", 3_000, 250, 30_000),
  }
}
