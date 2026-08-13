import { createServer } from "node:http"
import { createHmac, timingSafeEqual } from "node:crypto"
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"

const DEFAULT_PORT = 8080
const MARKER_MODE = 0o644

const SCENARIOS = Object.freeze({
  healthy: {
    components: {},
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
  },
  recovery: {
    components: {},
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
  },
  "api-down": {
    components: { apiLive: false, apiReady: false, snapshot: false },
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["FAILURE", "API_UNAVAILABLE", 0, 0],
  },
  "api-not-ready": {
    components: { apiReady: false, snapshot: false },
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["FAILURE", "API_UNAVAILABLE", 0, 0],
  },
  "database-down": {
    components: { database: false, apiReady: false, snapshot: false },
    backup: ["FAILURE", "PG_DUMP_FAILED"],
    worker: ["FAILURE", "API_UNAVAILABLE", 0, 0],
  },
  "web-down": {
    components: { web: false },
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
  },
  "pwa-down": {
    components: { pwa: false },
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
  },
  "browser-down": {
    components: { browser: false },
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
  },
  "caddy-down": {
    components: { caddy: false },
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
  },
  "backup-failure": {
    components: {},
    backup: ["FAILURE", "CHECKSUM_FAILED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
  },
  "worker-stale": {
    components: {},
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 600],
  },
  "worker-failure": {
    components: {},
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["FAILURE", "PROCESS_REQUEST_REJECTED", 5, 0],
  },
  "low-storage": {
    components: {},
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
    lowStorage: true,
  },
  "central-standalone": {
    components: {},
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
    centralStandalone: true,
  },
  "mail-unconfigured": {
    components: {},
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
    mailConfigured: false,
  },
  "migration-pending": {
    components: {},
    backup: ["SUCCESS", "BACKUP_VERIFIED"],
    worker: ["SUCCESS", "PROCESS_REQUEST_ACCEPTED", 0, 0],
    migrationFailed: true,
  },
})

function isoTime(offsetSeconds = 0) {
  return new Date(Date.now() - offsetSeconds * 1_000).toISOString()
}

function markerPath(signalsDir, filename) {
  return path.join(signalsDir, filename)
}

async function writeMarker(signalsDir, filename, value) {
  await mkdir(signalsDir, { recursive: true, mode: 0o755 })
  await chmod(signalsDir, 0o755)
  const destination = markerPath(signalsDir, filename)
  const temporary = markerPath(
    signalsDir,
    `.${filename}.tmp.${process.pid}.${Date.now()}`,
  )
  await writeFile(temporary, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    mode: MARKER_MODE,
  })
  await chmod(temporary, MARKER_MODE)
  await rename(temporary, destination)
}

async function writeScenarioMarkers(signalsDir, scenario) {
  const [backupState, backupResultCode] = scenario.backup
  const backupMarker = {
    schemaVersion: 1,
    signalType: "backup",
    observedAt: isoTime(),
    state: backupState,
    resultCode: backupResultCode,
  }
  if (backupState === "SUCCESS") {
    backupMarker.artifactBytes = 1_048_576
    backupMarker.checksumAlgorithm = "sha256"
  }

  const [workerState, workerResultCode, httpStatusCategory, staleSeconds] = scenario.worker
  const workerMarker = {
    schemaVersion: 1,
    signalType: "delivery-worker",
    observedAt: isoTime(staleSeconds),
    state: workerState,
    resultCode: workerResultCode,
    ...(httpStatusCategory > 0 ? { httpStatusCategory } : {}),
  }

  await Promise.all([
    writeMarker(signalsDir, "backup-status.v1.json", backupMarker),
    writeMarker(signalsDir, "delivery-worker-status.v1.json", workerMarker),
  ])
}

function secureTokenEqual(expected, received) {
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return expectedBytes.length === receivedBytes.length
    && timingSafeEqual(expectedBytes, receivedBytes)
}

function bearerToken(request) {
  const value = request.headers.authorization
  return value?.startsWith("Bearer ") ? value.slice(7) : ""
}

function sendJson(response, statusCode, body) {
  const payload = `${JSON.stringify(body)}\n`
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  })
  response.end(payload)
}

function componentResponse(response, component, available) {
  sendJson(response, available ? 200 : 503, {
    schemaVersion: 1,
    component,
    status: available ? "operational" : "unavailable",
  })
}

function snapshotFor(scenario, snapshotToken) {
  const centralConfigured = !scenario.centralStandalone
  return {
    schemaVersion: 1,
    generatedAt: isoTime(),
    versions: {
      hospital: "fixture-1.0.0",
      api: "fixture-1.0.0",
      core: "fixture-1.0.0",
      databaseSchema: "hospital-2",
    },
    operatorCredentialGeneration: 1,
    operatorCredentialIdentityProof: createHmac("sha256", snapshotToken)
      .update("operator-email-v1\u0000status-admin@lospor.localhost", "utf8")
      .digest("hex"),
    email: { configured: scenario.mailConfigured !== false },
    database: {
      logicalSize: { state: "known", bytes: "134217728" },
      migrations: scenario.migrationFailed
        ? { state: "failed", appliedCount: 12, failedCount: 1, latestFinishedAt: isoTime(3600) }
        : { state: "ok", appliedCount: 12, failedCount: 0, latestFinishedAt: isoTime(3600) },
    },
    research: {
      exportsByStatus: { PENDING: 0, RUNNING: 0, COMPLETE: 2, FAILED: 0 },
      storage: {
        driver: "filesystem",
        state: "known",
        totalBytes: "21474836480",
        availableBytes: scenario.lowStorage ? "67108864" : "17179869184",
      },
    },
    central: {
      configured: centralConfigured,
      enrolled: centralConfigured,
      exportPolicyApproved: centralConfigured,
      casesWithUnacceptedChanges: 0,
      deliveriesByStatus: centralConfigured ? { ACCEPTED: 2 } : {},
      enrolledAt: centralConfigured ? isoTime(86_400) : null,
      lastCapabilitiesAt: centralConfigured ? isoTime(600) : null,
      lastDeliveryAt: centralConfigured ? isoTime(300) : null,
    },
  }
}

async function tokenFromFile(file, code) {
  if (!file) throw new Error(code)
  let token
  try {
    token = (await readFile(file, "utf8")).trim()
  } catch {
    throw new Error(code)
  }
  if (token.length < 24 || token.length > 512) throw new Error(code)
  return token
}

export async function createFixtureServer(options = {}) {
  const port = options.port ?? Number(process.env.FIXTURE_PORT ?? DEFAULT_PORT)
  const host = options.host ?? process.env.FIXTURE_HOST ?? "0.0.0.0"
  const signalsDir = options.signalsDir ?? process.env.HOSPITAL_SIGNALS_DIR ?? "/signals"
  const controlToken = options.controlToken ?? await tokenFromFile(
    options.controlTokenFile ?? process.env.FIXTURE_CONTROL_TOKEN_FILE,
    "FIXTURE_CONTROL_TOKEN_MISSING",
  )
  const snapshotToken = options.snapshotToken ?? await tokenFromFile(
    options.snapshotTokenFile ?? process.env.FIXTURE_SNAPSHOT_TOKEN_FILE,
    "FIXTURE_SNAPSHOT_TOKEN_MISSING",
  )

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("FIXTURE_PORT_INVALID")
  }
  if (controlToken.length < 24 || snapshotToken.length < 24) {
    throw new Error("FIXTURE_TOKEN_INVALID")
  }

  let scenarioName = "healthy"
  let scenario = SCENARIOS[scenarioName]
  let scenarioQueue = Promise.resolve()
  await writeScenarioMarkers(signalsDir, scenario)

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.invalid")
    const componentRoutes = new Map([
      ["/api/health/live", ["api-live", "apiLive"]],
      ["/api/health/ready", ["api-ready", "apiReady"]],
      ["/database/health", ["database", "database"]],
      ["/web/health", ["web", "web"]],
      ["/pwa/health", ["pwa", "pwa"]],
      ["/browser/health", ["browser", "browser"]],
      ["/caddy/health", ["caddy", "caddy"]],
    ])

    if (request.method === "GET" && componentRoutes.has(url.pathname)) {
      const [component, key] = componentRoutes.get(url.pathname)
      componentResponse(response, component, scenario.components[key] !== false)
      return
    }

    if (request.method === "GET" && url.pathname === "/internal/appliance-status") {
      if (!secureTokenEqual(snapshotToken, bearerToken(request))) {
        sendJson(response, 401, { code: "SNAPSHOT_UNAUTHORIZED" })
        return
      }
      if (scenario.components.snapshot === false) {
        sendJson(response, 503, { code: "SNAPSHOT_UNAVAILABLE" })
        return
      }
      sendJson(response, 200, snapshotFor(scenario, snapshotToken))
      return
    }

    if (request.method === "GET" && url.pathname === "/__control/state") {
      if (!secureTokenEqual(controlToken, bearerToken(request))) {
        sendJson(response, 401, { code: "CONTROL_UNAUTHORIZED" })
        return
      }
      sendJson(response, 200, { schemaVersion: 1, scenario: scenarioName })
      return
    }

    const controlMatch = /^\/__control\/scenarios\/([a-z-]+)$/.exec(url.pathname)
    if (request.method === "POST" && controlMatch) {
      if (!secureTokenEqual(controlToken, bearerToken(request))) {
        sendJson(response, 401, { code: "CONTROL_UNAUTHORIZED" })
        return
      }
      const requestedName = controlMatch[1]
      const requestedScenario = SCENARIOS[requestedName]
      if (!requestedScenario) {
        sendJson(response, 422, { code: "SCENARIO_UNKNOWN" })
        return
      }

      scenarioQueue = scenarioQueue.then(async () => {
        await writeScenarioMarkers(signalsDir, requestedScenario)
        scenarioName = requestedName
        scenario = requestedScenario
      })
      scenarioQueue.then(
        () => sendJson(response, 200, { schemaVersion: 1, scenario: scenarioName }),
        () => sendJson(response, 500, { code: "SCENARIO_APPLY_FAILED" }),
      )
      return
    }

    sendJson(response, 404, { code: "FIXTURE_ROUTE_NOT_FOUND" })
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, resolve)
  })

  return {
    address: server.address(),
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }),
  }
}

const isEntrypoint = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntrypoint) {
  createFixtureServer()
    .then(() => process.stdout.write("FIXTURE_READY\n"))
    .catch(() => {
      process.stderr.write("FIXTURE_START_FAILED\n")
      process.exitCode = 1
    })
}
