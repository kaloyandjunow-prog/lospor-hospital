import { strict as assert } from "node:assert"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
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
    "postgres", "api", "web", "pwa", "browser", "caddy", "acme-http",
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

test("every writer to the signals volume can actually write to it", () => {
  // Three services have now been broken by the same mistake, one at a time.
  //
  // runtime-secrets-init hands /signals to SIGNALS_UID:SIGNALS_GID so the
  // delivery worker can stop running as root. Dropping every capability then
  // took DAC_OVERRIDE from the services that were reaching that directory by
  // being root, and each failed silently and separately: the worker first, then
  // the backup loop, then the tools container that publishes the update signal.
  // Each was found by someone noticing a marker that never appeared.
  //
  // So make adding a writer a decision rather than an oversight. Every service
  // that mounts the volume writable must be classified here, and the two
  // mechanisms that can be checked from the Compose text are checked.
  //
  // "image-user" cannot be verified textually -- it depends on the base image's
  // passwd file -- so it is recorded rather than proved, and the runtime proof
  // lives in scripts/test-install.sh, which asserts each marker actually
  // appears on a real appliance.
  const WRITERS = {
    // curl_user is uid 100 in curlimages/curl, which is why SIGNALS_UID is 100.
    "delivery-worker": "image-user",
    backup: "dac-override",
    tools: "dac-override",
  }

  const signalsUid = compose.match(/SIGNALS_UID: (\d+)/)?.[1]
  assert.ok(signalsUid, "compose.yaml no longer declares SIGNALS_UID")

  const writers = []
  for (const [name, block] of blocks) {
    // `status-signals:/signals:ro` is a reader; the init container owns the
    // directory and is what sets that ownership in the first place.
    const mount = block.match(/^\s*- status-signals:\S+$/m)?.[0]
    if (!mount || mount.trim().endsWith(":ro")) continue
    if (name === "runtime-secrets-init") continue
    writers.push([name, block])
  }

  for (const [name, block] of writers) {
    const mechanism = WRITERS[name]
    assert.ok(
      mechanism,
      `${name} mounts the signals volume writable but is not classified in this test. ` +
      "Say how it can write -- as the owning UID, or with DAC_OVERRIDE -- or its " +
      "marker will never appear and nothing will say so.",
    )
    if (mechanism === "dac-override") {
      assert.match(
        block, /cap_add: \[[^\]]*DAC_OVERRIDE/,
        `${name} is classified dac-override but does not hold it`,
      )
    }
    if (mechanism === "compose-user") {
      const user = block.match(/user: "(\d+):(\d+)"/)
      assert.equal(user?.[1], signalsUid, `${name} does not run as the signals UID`)
    }
  }

  for (const name of Object.keys(WRITERS)) {
    assert.ok(
      writers.some(([writer]) => writer === name),
      `${name} is classified as a signals writer but no longer mounts the volume writable`,
    )
  }
})

test("the update request channel is writable by Status and by nobody else", () => {
  // The same class of bug as the signals volume, which took three goes to
  // notice: a directory mounted writable that the process cannot actually write
  // to, failing silently because nothing ever asserted otherwise.
  //
  // Here the failure would be worse than a missing marker. Status is the only
  // thing that can ask for an update; if its request never lands, the button
  // does nothing and the page has no way to say why.
  const mountsOf = (block, hostPath) => block
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith(`- ${hostPath}:`))
    .map(line => line.slice(`- ${hostPath}:`.length))

  const requestWriters = []
  for (const [name, block] of blocks) {
    for (const mount of mountsOf(block, "./.data/update/requests")) {
      if (!mount.endsWith(":ro")) requestWriters.push(name)
    }
  }

  assert.deepEqual(
    requestWriters.sort(), ["runtime-secrets-init", "status"],
    "only Status writes requests, and only the init container that owns the directory sets it up",
  )

  // Status must not be able to edit the agent's own account of what it did.
  const statusState = mountsOf(blocks.get("status"), "./.data/update/state")
  assert.equal(statusState.length, 1, "Status no longer reads the agent's state")
  assert.ok(
    statusState[0].endsWith(":ro"),
    "Status mounts the agent's state writable; it reports what the agent did and must not rewrite it",
  )

  // And it still cannot apply anything itself. The channel exists precisely so
  // that the process reachable from a browser never holds this.
  assert.ok(
    !blocks.get("status").includes("docker.sock"),
    "Status has a docker socket; the request channel exists so it does not need one",
  )
})

test("the channel is owned before anything mounts it", () => {
  // A bind mount whose host path does not exist is created by the daemon as
  // root. The one-shot that owns it holds CHOWN but not FOWNER, so it could
  // never take the mode back -- Status would have nowhere to write, and nothing
  // would say so.
  const init = blocks.get("runtime-secrets-init")
  assert.ok(init.includes("UPDATE_REQUESTS_TARGET:"), "the init container is not told where requests live")
  assert.ok(init.includes("UPDATE_STATE_TARGET:"), "the init container is not told where the agent state lives")

  for (const script of ["scripts/activate-verified-release.sh", "scripts/install.sh"]) {
    const source = readFileSync(join(root, script), "utf8")
    const creates = source
      .split("\n")
      .some(line => line.startsWith("mkdir -p") && line.includes("update/requests"))
    assert.ok(creates, `${script} does not create the request channel before Compose mounts it`)
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

test("the guided default locale reaches every server-rendered application", () => {
  const apiEnvironment = compose.slice(
    compose.indexOf("x-api-environment:"),
    compose.indexOf("\nservices:"),
  )
  assert.match(apiEnvironment, /PEDIATRIC_MODE_ENABLED: "true"/)
  assert.match(apiEnvironment, /LOSPOR_DEFAULT_LOCALE: \$\{LOSPOR_DEFAULT_LOCALE:-bg\}/)
  assert.match(apiEnvironment, /LOSPOR_SUPPORT_URL: \$\{HOSPITAL_SUPPORT_URL:-\}/)
  assert.match(apiEnvironment, /LOSPOR_DEPLOYMENT_MODE: hospital/)
  assert.match(apiEnvironment, /LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED: "true"/)
  assert.match(apiEnvironment, /LOSPOR_ADMIN_MFA_REQUIRED: "true"/)
  assert.match(apiEnvironment, /LOSPOR_MFA_ENCRYPTION_KEY_FILE: \/run\/secrets\/mfa-encryption-key/)
  assert.match(apiEnvironment, /HOSPITAL_ADULT_GUIDANCE_DEFAULT: \$\{HOSPITAL_ADULT_GUIDANCE_DEFAULT:-true\}/)
  assert.match(apiEnvironment, /HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT: \$\{HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT:-true\}/)
  assert.match(apiEnvironment, /HOSPITAL_EXTERNAL_AI_DEFAULT: \$\{HOSPITAL_EXTERNAL_AI_DEFAULT:-true\}/)
  assert.match(apiEnvironment, /HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE: \/run\/secrets\/external-ai-seal-key/)
  // The EHR transport credential is sealed with this key and stored in the
  // database, so losing the mount loses every configured transport rather than
  // merely failing to start.
  assert.match(apiEnvironment, /HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE: \/run\/secrets\/ehr-transport-seal-key/)
  for (const name of ["web", "browser", "status"]) {
    assert.match(
      blocks.get(name),
      /LOSPOR_DEFAULT_LOCALE: \$\{LOSPOR_DEFAULT_LOCALE:-bg\}/,
      `${name} does not receive the installer-selected default locale`,
    )
  }
  assert.match(
    blocks.get("status"),
    /STATUS_CONTROL_PLANE_URL: http:\/\/api:3002\/v1\/internal\/hospital\/control-plane/,
  )
})

test("scheduled backups receive the complete authenticated recovery policy", () => {
  const backup = blocks.get("backup")
  for (const binding of [
    "HOSPITAL_BACKUP_INTERVAL_SECONDS: ${HOSPITAL_BACKUP_INTERVAL_SECONDS:-14400}",
    "HOSPITAL_BACKUP_KEEP_ALL_SECONDS: ${HOSPITAL_BACKUP_KEEP_ALL_SECONDS:-172800}",
    "HOSPITAL_BACKUP_DAILY_POINTS: ${HOSPITAL_BACKUP_DAILY_POINTS:-14}",
    "HOSPITAL_BACKUP_SITE_ID: ${HOSPITAL_BACKUP_SITE_ID}",
    "HOSPITAL_BACKUP_APPLIANCE_ID: ${HOSPITAL_BACKUP_APPLIANCE_ID}",
    "HOSPITAL_BACKUP_MANIFEST_HMAC_KEY: ${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY}",
    "HOSPITAL_BACKUP_OFFHOST_HOOK: /usr/local/bin/backup-offhost-hook",
    "./infra/postgres/backup-object-lib.sh:/usr/local/bin/backup-object-lib.sh:ro",
    "./secrets/backup/offhost-copy:/usr/local/bin/backup-offhost-hook:ro",
  ]) {
    assert.ok(backup.includes(binding), `backup service lost recovery binding: ${binding}`)
  }
  for (const fingerprint of [
    "HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT",
    "HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT",
    "HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT",
    "HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT",
    "HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT",
    "HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT",
    "HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT",
  ]) {
    const binding = fingerprint + ": ${" + fingerprint + "}"
    assert.ok(backup.includes(binding), `backup service lost key fingerprint: ${fingerprint}`)
  }
})

test("backup and host updates share one persistent maintenance-lock inode", () => {
  const backup = blocks.get("backup")
  assert.match(backup, /HOSPITAL_IO_MUTATION_LOCK_FILE: \/run\/lospor\/io-mutation\.lock/)
  assert.match(
    backup,
    /\$\{LOSPOR_APPLIANCE_HOME:-\.\}\/\.data\/io-mutation\.lock:\/run\/lospor\/io-mutation\.lock/,
  )
  const backupOnce = readFileSync(join(root, "infra/postgres/backup-once.sh"), "utf8")
  assert.match(backupOnce, /flock -w "\$lock_wait" 8/)
  assert.match(backupOnce, /BACKUP_MAINTENANCE_BUSY/)
  const updateLibrary = readFileSync(join(root, "scripts/update-pipeline-lib.sh"), "utf8")
  assert.match(updateLibrary, /\.data\/io-mutation\.lock/)
  assert.match(updateLibrary, /flock -n 8/)
  for (const script of ["scripts/install.sh", "scripts/activate-verified-release.sh"]) {
    assert.match(
      readFileSync(join(root, script), "utf8"),
      /\.data\/io-mutation\.lock/,
      `${script} does not pre-create the persistent shared lock`,
    )
  }
  const postgresImage = readFileSync(join(root, "infra/docker/postgres.Dockerfile"), "utf8")
  assert.match(postgresImage, /cp \/usr\/bin\/flock \/usr\/local\/bin\/flock/)
  assert.match(postgresImage, /flock -n \/tmp\/lospor-flock-smoke\.lock true/)
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
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1e8,
      env: {
        ...process.env,
        HOSPITAL_TLS_MODE: "local",
        COMPOSE_PROFILES: "",
        HOSPITAL_RESEARCH_ALLOWED_CIDRS: "127.0.0.1/32",
        HOSPITAL_STATUS_ALLOWED_CIDRS: "127.0.0.1/32",
        HOSPITAL_BACKUP_SITE_ID: "site-fixture",
        HOSPITAL_BACKUP_APPLIANCE_ID: "appliance-fixture",
        HOSPITAL_BACKUP_MANIFEST_HMAC_KEY: "0123456789abcdef0123456789abcdef",
        HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT: `sha256:${"a".repeat(64)}`,
        HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT: `sha256:${"b".repeat(64)}`,
        HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT: `sha256:${"c".repeat(64)}`,
        HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT: `sha256:${"1".repeat(64)}`,
        HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT: `sha256:${"d".repeat(64)}`,
        HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT: `sha256:${"e".repeat(64)}`,
        HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT: `sha256:${"f".repeat(64)}`,
      },
    },
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

test("the running API connects as its restricted role, and only migrations and tools as the owner", () => {
  // Until 1.4.0 every API request ran as the database superuser.
  const apiEnvironment = compose.slice(compose.indexOf("x-api-environment:"), compose.indexOf("\nservices:"))
  assert.match(apiEnvironment, /DATABASE_URL: postgresql:\/\/lospor_app:\$\{HOSPITAL_POSTGRES_APP_PASSWORD\}@postgres:5432\/lospor/)
  assert.doesNotMatch(apiEnvironment, /postgresql:\/\/lospor:/)
  for (const name of ["migrate", "tools"]) {
    assert.match(blocks.get(name), /DATABASE_URL: postgresql:\/\/lospor:\$\{HOSPITAL_POSTGRES_PASSWORD\}@postgres:5432\/lospor/, `${name} lost the owner role`)
  }
  assert.doesNotMatch(blocks.get("api"), /HOSPITAL_POSTGRES_PASSWORD/, "the API was given the owner password")
  assert.match(blocks.get("db-app-role-init"), /migrate:\s+condition: service_completed_successfully/)
  assert.match(blocks.get("api"), /db-app-role-init:\s+condition: service_completed_successfully/,
    "the API can start before its role and grants exist")
})
