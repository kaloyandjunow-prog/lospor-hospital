import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadConfig } from "./config.js"

const directories: string[] = []
afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})

function secret(directory: string, name: string, value: string): string {
  const path = join(directory, name)
  writeFileSync(path, value, { encoding: "utf8", mode: 0o600 })
  return path
}

describe("status configuration", () => {
  it("reads secrets from files and accepts the fixture database URL override", () => {
    const directory = mkdtempSync(join(tmpdir(), "lospor-status-config-"))
    directories.push(directory)
    const config = loadConfig({
      STATUS_DATABASE_PATH: join(directory, "status.sqlite"),
      STATUS_RATE_LIMIT_KEY_FILE: secret(directory, "rate", "r".repeat(32)),
      STATUS_EVENT_TOKENS_FILE: secret(directory, "events", JSON.stringify({ api: "a".repeat(24) })),
      STATUS_SNAPSHOT_TOKEN_FILE: secret(directory, "snapshot", "s".repeat(24)),
      STATUS_DATABASE_HEALTH_URL: "http://fixture:4000/database",
      STATUS_CADDY_HEALTH_URL: "http://fixture:4000/caddy/health",
    })
    expect(config.eventTokens.get("api")).toBe("a".repeat(24))
    expect(config.snapshotToken).toBe("s".repeat(24))
    expect(config.databaseHealthUrl).toBe("http://fixture:4000/database")
    expect(config.caddyHealthUrl).toBe("http://fixture:4000/caddy/health")
    expect(config.httpPort).toBe(3004)
  })

  it("requires both fallback TLS files and exactly /status", () => {
    const directory = mkdtempSync(join(tmpdir(), "lospor-status-config-"))
    directories.push(directory)
    const base = { STATUS_RATE_LIMIT_KEY_FILE: secret(directory, "rate", "r".repeat(32)) }
    expect(() => loadConfig({ ...base, STATUS_TLS_CERT_FILE: "/cert" })).toThrow(/Both STATUS_TLS/)
    expect(() => loadConfig({ ...base, STATUS_BASE_PATH: "/admin" })).toThrow(/must be \/status/)
  })
})
