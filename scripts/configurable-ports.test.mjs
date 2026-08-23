import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import test from "node:test"
import { promisify } from "node:util"

const run = promisify(execFile)
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")

/**
 * A host that already uses 443 or 3443 can move them; port 80 cannot move.
 *
 * These assert what Compose actually resolves rather than what the file appears
 * to say, because the failure mode is quiet: a variable that never substitutes
 * still starts an appliance, on the default port, and the operator finds out
 * when the port they configured is not listening.
 */
async function publishedPorts(env = {}) {
  const { stdout } = await run("docker", ["compose", "-f", "compose.yaml", "config"], {
    cwd: root,
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  })
  // `target` is the container port, `published` the host one, and `host_ip`
  // appears only where the binding is restricted.
  const ports = []
  const lines = stdout.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const target = lines[i].match(/^\s*target:\s*(\d+)\s*$/)
    if (!target) continue
    const window = lines.slice(Math.max(0, i - 2), i + 3).join("\n")
    const published = window.match(/published:\s*"?(\d+)"?/)
    if (!published) continue
    const hostIp = window.match(/host_ip:\s*([0-9.]+)/)
    ports.push({ container: target[1], host: published[1], hostIp: hostIp?.[1] ?? null })
  }
  return ports
}

const find = (ports, container) => ports.find(p => p.container === container)

test("operator TLS publishes HTTPS and loopback Status, but not port 80", async () => {
  const ports = await publishedPorts({ HOSPITAL_TLS_MODE: "operator", COMPOSE_PROFILES: "" })
  assert.equal(find(ports, "80"), undefined)
  assert.equal(find(ports, "443").host, "443")
  assert.equal(find(ports, "3443").host, "3443")
})

test("HTTPS and Status move when a host already uses them", async () => {
  const ports = await publishedPorts({
    HOSPITAL_TLS_MODE: "operator",
    COMPOSE_PROFILES: "",
    HOSPITAL_HTTPS_PORT: "8443",
    HOSPITAL_STATUS_PORT: "9443",
  })
  assert.equal(find(ports, "443").host, "8443")
  assert.equal(find(ports, "3443").host, "9443")
})

test("ACME alone publishes fixed host port 80", async () => {
  // Certificates are issued over the ACME HTTP-01 challenge, which Let's
  // Encrypt validates on port 80 of the public name and nowhere else. An
  // appliance that honoured an override here would install cleanly and stop
  // renewing ninety days later.
  const ports = await publishedPorts({
    HOSPITAL_TLS_MODE: "acme",
    COMPOSE_PROFILES: "tls-acme",
    HOSPITAL_HTTP_PORT: "8080",
    HOSPITAL_HTTPS_PORT: "8443",
  })
  assert.equal(find(ports, "80").host, "80")
})

test("the Status page stays bound to loopback at any port", async () => {
  // Publishing the outage page to a LAN is a security regression, so the
  // 127.0.0.1 prefix lives outside the variable and cannot be dropped by
  // setting a port.
  const ports = await publishedPorts({ HOSPITAL_TLS_MODE: "operator", COMPOSE_PROFILES: "", HOSPITAL_STATUS_PORT: "9443" })
  assert.equal(find(ports, "3443").hostIp, "127.0.0.1")
})

test("the clinical HTTPS port is reachable from off-host", async () => {
  // The counterpart to the check above: this one must NOT be loopback-bound,
  // or clinicians cannot reach the appliance at all.
  const ports = await publishedPorts({ HOSPITAL_TLS_MODE: "operator", COMPOSE_PROFILES: "", HOSPITAL_HTTPS_PORT: "8443" })
  assert.equal(find(ports, "443").hostIp, null)
})
