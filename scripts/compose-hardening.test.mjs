import { strict as assert } from "node:assert"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

/**
 * Every service must be hardened, and adding a new one must not quietly opt out.
 *
 * 1.0.0 set read_only, cap_drop and no-new-privileges on three services and left
 * them off the eight others -- including PostgreSQL, the API and the TLS edge.
 * That is the failure this guards: not an absent control, but an inconsistent
 * one, which reads as hardened at a glance.
 *
 * The Compose file is parsed as text rather than through `docker compose
 * config`, so this runs without a Docker daemon and covers services behind a
 * profile too.
 */

const root = fileURLToPath(new URL("..", import.meta.url))
const compose = readFileSync(new URL("../compose.yaml", import.meta.url), "utf8")

// Service blocks are two-space-indented keys under `services:`.
function serviceBlocks() {
  const body = compose.slice(compose.indexOf("\nservices:"))
  const end = body.search(/\nvolumes:|\nnetworks:|\nsecrets:/)
  const services = (end === -1 ? body : body.slice(0, end)).split(/\n {2}(?=[a-z][a-z0-9-]*:\n)/)
  const blocks = new Map()
  for (const chunk of services.slice(1)) {
    const name = chunk.match(/^([a-z][a-z0-9-]*):/)?.[1]
    if (name) blocks.set(name, chunk)
  }
  return blocks
}

const blocks = serviceBlocks()

// Comments here quote directives in prose -- the delivery worker's explains why
// it no longer carries `user: "0:0"` -- so anything asserting about directives
// has to read the code and not the commentary.
function code(block) {
  return block.split("\n").filter(line => !/^\s*#/.test(line)).join("\n")
}

// The anchor carries the three controls for most services; a few spell them out
// because they also add a capability back.
function hardened(block) {
  if (/<<: \*hardening/.test(block)) return true
  return /read_only: true/.test(block)
    && /cap_drop: \[ALL\]/.test(block)
    && /no-new-privileges/.test(block)
}

test("compose defines the services this appliance is made of", () => {
  for (const expected of [
    "postgres", "api", "web", "pwa", "browser", "caddy",
    "status", "backup", "delivery-worker", "migrate", "runtime-secrets-init",
  ]) {
    assert.ok(blocks.has(expected), `missing service ${expected}`)
  }
})

test("every service is hardened", () => {
  const unhardened = [...blocks].filter(([, b]) => !hardened(b)).map(([n]) => n)
  assert.deepEqual(unhardened, [], `unhardened services: ${unhardened.join(", ")}`)
})

test("only the secrets initialiser runs as root", () => {
  // The delivery worker used to, under a comment that never said what needed it.
  const asRoot = [...blocks]
    .filter(([, b]) => /user: "0:0"/.test(code(b)))
    .map(([n]) => n)
  assert.deepEqual(asRoot, ["runtime-secrets-init"])
})

test("every capability added back is accompanied by a reason", () => {
  for (const [name, block] of blocks) {
    const match = block.match(/([^\n]*\n[^\n]*\n)( *)cap_add:/)
    if (!match) continue
    assert.match(
      match[1], /#/,
      `${name} adds a capability with no comment explaining why`,
    )
  }
})

test("no service keeps the default capability set by omitting cap_drop", () => {
  for (const [name, block] of blocks) {
    if (/cap_add:/.test(block)) {
      assert.match(block, /cap_drop: \[ALL\]/, `${name} adds capabilities without dropping the rest`)
    }
  }
})

test("long-running services have a memory ceiling", () => {
  // Without one, a heavy research query can exhaust the host and take
  // PostgreSQL and Status with it.
  for (const [name, block] of blocks) {
    if (/profiles: \[tools\]/.test(block)) continue
    assert.match(block, /mem_limit:/, `${name} has no mem_limit`)
  }
})

test("Status is guaranteed memory of its own", () => {
  // It is what an operator reaches when the clinical stack is failing.
  assert.match(blocks.get("status"), /mem_limit: 256m/)
})

test("PostgreSQL is tuned rather than left on stock defaults", () => {
  const postgres = blocks.get("postgres")
  assert.match(postgres, /shared_buffers=/)
  assert.match(postgres, /effective_cache_size=/)
  // Docker caps /dev/shm at 64 MB, which parallel query allocates from.
  assert.match(postgres, /shm_size: 1gb/)
  assert.match(postgres, /archive_mode=off/, "verified dumps, not a WAL archive")
})

test("PostgreSQL settings stay consistent with its ceiling", () => {
  const postgres = blocks.get("postgres")
  const limit = Number(postgres.match(/mem_limit: (\d+)g/)?.[1])
  const shared = Number(postgres.match(/shared_buffers=(\d+)GB/)?.[1])
  const cache = Number(postgres.match(/effective_cache_size=(\d+)GB/)?.[1])
  assert.ok(limit > 0 && shared > 0 && cache > 0)
  assert.ok(shared <= limit / 2, "shared_buffers should stay well under the ceiling")
  assert.ok(cache <= limit, "effective_cache_size claims more memory than the container may use")
})

test("the compose file docker actually resolves agrees with this one", { skip: skipIfNoDocker() }, () => {
  const resolved = execFileSync(
    "docker", ["compose", "config", "--format", "json"],
    { cwd: root, encoding: "utf8", maxBuffer: 1e8, env: { ...process.env, HOSPITAL_CADDY_GLOBAL_EXTRA: "" } },
  )
  for (const [name, service] of Object.entries(JSON.parse(resolved).services)) {
    assert.equal(service.read_only, true, `${name} is not read_only once resolved`)
    assert.ok(
      (service.cap_drop ?? []).includes("ALL"),
      `${name} does not drop all capabilities once resolved`,
    )
  }
})

function skipIfNoDocker() {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" })
    return false
  } catch {
    return "docker compose is unavailable"
  }
}
