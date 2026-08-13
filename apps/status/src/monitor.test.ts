import { createServer } from "node:http"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import type { StatusConfig } from "./config.js"
import { StatusDatabase } from "./db.js"
import { StatusMonitor, operatorCredentialStatus } from "./monitor.js"
import { hmacSha256 } from "./util.js"

const databases: StatusDatabase[] = []
const directories: string[] = []
const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  while (databases.length) databases.pop()?.close()
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function fixture() {
  const server = createServer((request, response) => {
    if (request.url === "/down") {
      response.writeHead(503).end("down")
      return
    }
    response.writeHead(200, { "content-type": "application/json" }).end("{}")
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe("monitor probes", () => {
  it("compares both operator generation and a keyed identity proof", () => {
    const token = "snapshot-token-that-is-long-enough"
    const proof = hmacSha256(
      Buffer.from(token),
      "operator-email-v1\u0000operator@hospital.test",
    )
    expect(operatorCredentialStatus(
      { email: "Operator@Hospital.test", generation: 3 },
      { operatorCredentialGeneration: 3, operatorCredentialIdentityProof: proof },
      token,
    )).toBe("operational")
    expect(operatorCredentialStatus(
      { email: "different@hospital.test", generation: 3 },
      { operatorCredentialGeneration: 3, operatorCredentialIdentityProof: proof },
      token,
    )).toBe("degraded")
    expect(operatorCredentialStatus(
      { email: "operator@hospital.test", generation: 2 },
      { operatorCredentialGeneration: 3, operatorCredentialIdentityProof: proof },
      token,
    )).toBe("degraded")
  })

  it("supports an HTTP database fixture override without weakening production probing", async () => {
    const base = await fixture()
    const signalsDir = mkdtempSync(join(tmpdir(), "lospor-signals-"))
    directories.push(signalsDir)
    const observedAt = "2026-08-12T11:59:00.000Z"
    writeFileSync(join(signalsDir, "backup-status.v1.json"), JSON.stringify({
      schemaVersion: 1, signalType: "backup", observedAt, state: "SUCCESS",
      resultCode: "BACKUP_VERIFIED", artifactBytes: 100, checksumAlgorithm: "sha256",
    }))
    writeFileSync(join(signalsDir, "delivery-worker-status.v1.json"), JSON.stringify({
      schemaVersion: 1, signalType: "delivery-worker", observedAt, state: "SUCCESS",
      resultCode: "PROCESS_REQUEST_ACCEPTED",
    }))
    const db = new StatusDatabase(":memory:")
    databases.push(db)
    const config = {
      probeTimeoutMs: 1_000,
      checkIntervalMs: 15_000,
      apiLiveUrl: `${base}/ok`,
      apiReadyUrl: `${base}/ok`,
      webUrl: `${base}/ok`,
      pwaUrl: `${base}/ok`,
      browserUrl: `${base}/ok`,
      databaseHealthUrl: `${base}/ok`,
      caddyHealthUrl: `${base}/ok`,
      caddyHost: "127.0.0.1",
      caddyPort: new URL(base).port,
      signalsDir,
      snapshotUrl: null,
      snapshotToken: null,
      postgresHost: null,
      postgresPassword: null,
    } as unknown as StatusConfig
    const monitor = new StatusMonitor(config, db, () => Date.parse("2026-08-12T12:00:00.000Z"))
    await monitor.runOnce()
    const states = new Map(db.getDashboard().components.map(item => [item.component, item.status]))
    expect(states.get("database")).toBe("operational")
    expect(states.get("proxy")).toBe("operational")
    expect(states.get("api")).toBe("operational")
    expect(states.get("backup")).toBe("operational")
    expect(states.get("delivery-worker")).toBe("operational")
  })

  it("finishes independent service probes before starting API and database probes", async () => {
    const requestOrder: string[] = []
    const server = createServer((request, response) => {
      requestOrder.push(request.url ?? "")
      response.writeHead(200, { "content-type": "application/json" }).end("{}")
    })
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    servers.push(server)
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const signalsDir = mkdtempSync(join(tmpdir(), "lospor-signals-"))
    directories.push(signalsDir)
    const db = new StatusDatabase(":memory:")
    databases.push(db)
    const config = {
      probeTimeoutMs: 1_000,
      checkIntervalMs: 15_000,
      apiLiveUrl: `${base}/api-live`,
      apiReadyUrl: `${base}/api-ready`,
      webUrl: `${base}/web`,
      pwaUrl: `${base}/pwa`,
      browserUrl: `${base}/browser`,
      databaseHealthUrl: `${base}/database`,
      caddyHealthUrl: `${base}/gateway`,
      caddyHost: "127.0.0.1",
      caddyPort: new URL(base).port,
      signalsDir,
      snapshotUrl: null,
      snapshotToken: null,
      postgresHost: null,
      postgresPassword: null,
    } as unknown as StatusConfig

    await new StatusMonitor(config, db).runOnce()

    const independentLast = Math.max(...["/web", "/pwa", "/browser", "/gateway"]
      .map(path => requestOrder.indexOf(path)))
    const dependentFirst = Math.min(...["/api-live", "/api-ready", "/database"]
      .map(path => requestOrder.indexOf(path)))
    expect(independentLast).toBeGreaterThanOrEqual(0)
    expect(dependentFirst).toBeGreaterThan(independentLast)
  })
})
