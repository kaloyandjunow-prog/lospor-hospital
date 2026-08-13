import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { createFixtureServer } from "./server.mjs"

const CONTROL_TOKEN = "fixture-control-test-token"
const SNAPSHOT_TOKEN = "fixture-snapshot-test-token"

async function startFixture(t) {
  const signalsDir = await mkdtemp(path.join(tmpdir(), "lospor-status-fixture-"))
  const fixture = await createFixtureServer({
    port: 0,
    host: "127.0.0.1",
    signalsDir,
    controlToken: CONTROL_TOKEN,
    snapshotToken: SNAPSHOT_TOKEN,
  })
  const baseUrl = `http://127.0.0.1:${fixture.address.port}`
  t.after(async () => {
    await fixture.close()
    await rm(signalsDir, { recursive: true, force: true })
  })
  return { baseUrl, signalsDir }
}

async function marker(signalsDir, filename) {
  return JSON.parse(await readFile(path.join(signalsDir, filename), "utf8"))
}

test("starts healthy and publishes safe versioned markers", async (t) => {
  const { baseUrl, signalsDir } = await startFixture(t)

  const live = await fetch(`${baseUrl}/api/health/live`)
  assert.equal(live.status, 200)
  assert.deepEqual(await live.json(), {
    schemaVersion: 1,
    component: "api-live",
    status: "operational",
  })

  const backup = await marker(signalsDir, "backup-status.v1.json")
  assert.equal(backup.resultCode, "BACKUP_VERIFIED")
  assert.equal(backup.state, "SUCCESS")
  assert.equal(backup.schemaVersion, 1)
  assert.equal("path" in backup, false)
  assert.deepEqual(Object.keys(backup).sort(), [
    "artifactBytes", "checksumAlgorithm", "observedAt", "resultCode", "schemaVersion", "signalType", "state",
  ])

  const worker = await marker(signalsDir, "delivery-worker-status.v1.json")
  assert.equal(worker.resultCode, "PROCESS_REQUEST_ACCEPTED")
  assert.equal(worker.state, "SUCCESS")
})

test("control scenarios change only the declared probes", async (t) => {
  const { baseUrl } = await startFixture(t)
  const changed = await fetch(`${baseUrl}/__control/scenarios/database-down`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CONTROL_TOKEN}` },
  })
  assert.equal(changed.status, 200)

  assert.equal((await fetch(`${baseUrl}/database/health`)).status, 503)
  assert.equal((await fetch(`${baseUrl}/api/health/live`)).status, 200)
  assert.equal((await fetch(`${baseUrl}/api/health/ready`)).status, 503)
  assert.equal((await fetch(`${baseUrl}/web/health`)).status, 200)
})

test("snapshot and control routes require their independent tokens", async (t) => {
  const { baseUrl } = await startFixture(t)

  assert.equal((await fetch(`${baseUrl}/__control/state`)).status, 401)
  assert.equal((await fetch(`${baseUrl}/internal/appliance-status`)).status, 401)

  const snapshot = await fetch(`${baseUrl}/internal/appliance-status`, {
    headers: { Authorization: `Bearer ${SNAPSHOT_TOKEN}` },
  })
  assert.equal(snapshot.status, 200)
  const value = await snapshot.json()
  assert.equal(value.central.configured, true)
  assert.equal(value.operatorCredentialGeneration, 1)
  assert.deepEqual(Object.keys(value).sort(), [
    "central", "database", "email", "generatedAt", "operatorCredentialGeneration", "operatorCredentialIdentityProof", "research", "schemaVersion", "versions",
  ])
})

test("failure and stale scenarios atomically replace signal markers", async (t) => {
  const { baseUrl, signalsDir } = await startFixture(t)

  await fetch(`${baseUrl}/__control/scenarios/backup-failure`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CONTROL_TOKEN}` },
  })
  const backup = await marker(signalsDir, "backup-status.v1.json")
  assert.equal(backup.state, "FAILURE")
  assert.equal(backup.resultCode, "CHECKSUM_FAILED")
  assert.equal("artifactBytes" in backup, false)

  await fetch(`${baseUrl}/__control/scenarios/worker-stale`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CONTROL_TOKEN}` },
  })
  const worker = await marker(signalsDir, "delivery-worker-status.v1.json")
  assert.equal(worker.state, "SUCCESS")
  assert.ok(Date.now() - Date.parse(worker.observedAt) >= 590_000)
})

test("unknown scenarios are rejected without accepting free-form state", async (t) => {
  const { baseUrl } = await startFixture(t)
  const response = await fetch(`${baseUrl}/__control/scenarios/arbitrary-state`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CONTROL_TOKEN}` },
  })
  assert.equal(response.status, 422)
  assert.deepEqual(await response.json(), { code: "SCENARIO_UNKNOWN" })
})
