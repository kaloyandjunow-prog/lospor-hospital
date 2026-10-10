// Status for the cross-app suite (1.5.5). Test only: never part of the Status
// image, which is built from apps/status alone.
//
// The real Status app, driving the real API through the internal control plane
// with the same account-control token the e2e API is started with, so a spec
// can use the operator's own screens. Signing in to Status needs MFA, which a
// browser test cannot complete, so the administrator and a signed-in session
// are created here and the session is written to a file for the spec to use as
// a cookie. Everything after that -- the editor, its password confirmation and
// the save -- is what an operator does.
//
// The appliance gateway replaces Status's `no-referrer` policy (see
// infra/caddy/Caddyfile); without that, browsers send `Origin: null` and Status
// refuses every form post, so this server does the same.
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createStatusApp } from "../../../status/src/app.js"
import { AuthService } from "../../../status/src/auth.js"
import type { StatusConfig } from "../../../status/src/config.js"
import { StatusDatabase } from "../../../status/src/db.js"
import { totpCode } from "../../../status/src/mfa.js"
import { nodeRequestHandler } from "../../../status/src/node-server.js"
import { STATUS_E2E_EMAIL, STATUS_E2E_PASSWORD, STATUS_E2E_PORT, STATUS_E2E_SESSION_FILE } from "./status-e2e"

const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(name + " is required")
  return value
}

const port = STATUS_E2E_PORT
const controlPlaneUrl = required("STATUS_E2E_CONTROL_PLANE_URL")
const token = readFileSync(required("STATUS_E2E_TOKEN_FILE"), "utf8").trim()
const sessionFile = STATUS_E2E_SESSION_FILE

const workspace = mkdtempSync(join(tmpdir(), "status-e2e-"))
const dirs = ["state", "signals", "requests"].map(name => join(workspace, name))
for (const directory of dirs) mkdirSync(directory, { recursive: true })
const db = new StatusDatabase(":memory:")
const auth = new AuthService(db, Buffer.alloc(32, 7), 4, () => Date.now())
const config = {
  defaultLocale: "en",
  basePath: "/status",
  eventTokens: new Map(),
  updateStateDir: dirs[0],
  signalsDir: dirs[1],
  updateRequestsDir: dirs[2],
  rateLimitKey: Buffer.alloc(32, 7),
  controlPlaneUrl,
  accountControlToken: token,
  probeTimeoutMs: 15_000,
} as unknown as StatusConfig

const app = createStatusApp({ db, auth, config })

async function main() {
  await auth.initialize(STATUS_E2E_EMAIL, STATUS_E2E_PASSWORD)
  const challenge = await auth.beginPasswordLogin({ email: STATUS_E2E_EMAIL, password: STATUS_E2E_PASSWORD, clientAddress: "127.0.0.1" })
  const login = auth.completeMfaLogin({ challengeToken: challenge.challengeToken, code: totpCode(challenge.manualKey!, Date.now()), clientAddress: "127.0.0.1" })
  mkdirSync(dirname(sessionFile), { recursive: true })
  writeFileSync(sessionFile, login.sessionToken)
}

async function withGatewayHeaders(pending: Response | Promise<Response>): Promise<Response> {
  const response = await pending
  const headers = new Headers(response.headers)
  headers.set("referrer-policy", "strict-origin-when-cross-origin")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

void main().then(() => createServer(nodeRequestHandler(request => withGatewayHeaders(app.fetch(request)), "http"))
  .listen(port, "127.0.0.1", () => console.log("Status e2e on http://127.0.0.1:" + port + "/status/")))
