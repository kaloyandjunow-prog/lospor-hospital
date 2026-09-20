import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test, { after } from "node:test"
import { promisify } from "node:util"

// Shaped like the token GHCR actually issues: base64, and padded. A
// hand-written token without the trailing "=" is what let an allowlist that
// rejected padding pass this suite while failing against the real registry.
const REGISTRY_TOKEN = "djE6a2Fsb3lhbmRqdW5vdy1wcm9nL2xvc3Bvci1ob3NwaXRhbC1hcGk6MTc4OTkwMzA2MzU4OTE1ODQ0Nw=="

const run = promisify(execFile)
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")

/**
 * Paths handed to `sh` must use forward slashes.
 *
 * Node's tmpdir and path.join produce backslashes on Windows, which a POSIX
 * shell treats as escapes rather than separators -- the appliance home then
 * resolves to nothing and the script exits before recording anything. The
 * deployment target is Linux, where this is a no-op; it exists so the suite is
 * runnable on the maintainer's machine.
 */
const posix = value => value
  .replaceAll("\\", "/")
  .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)

const fixtureRoot = join(root, ".data", "test-tmp")
const applianceHomes = []
after(async () => {
  await Promise.all(applianceHomes.map(home => rm(home, { recursive: true, force: true })))
})

/**
 * Drives scripts/check-for-update.sh end to end against a stub registry.
 *
 * The point of these tests is not the happy path. It is that an appliance which
 * cannot reach the registry records "unknown" and never "current" -- a hospital
 * must not be told it is running the newest release because its network was
 * down.
 */

async function fakeRegistry(handler) {
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  return { origin, close: () => new Promise(resolve => server.close(resolve)) }
}

function tagListRegistry(tags) {
  return fakeRegistry((request, response) => {
    if (request.url.startsWith("/token")) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ token: REGISTRY_TOKEN }))
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ tags }))
  })
}

/** A minimal appliance home whose installed-release state parses as valid. */
async function applianceHome(version) {
  await mkdir(fixtureRoot, { recursive: true })
  const home = await mkdtemp(join(fixtureRoot, "lospor-update-check-"))
  applianceHomes.push(home)
  const relative = `.data/releases/${version}/lospor-hospital-${version}`
  const releaseRoot = join(home, relative)
  await mkdir(join(releaseRoot, ".release"), { recursive: true })
  await writeFile(join(releaseRoot, "compose.yaml"), "services: {}\n")
  await writeFile(join(releaseRoot, "compose.release.yaml"), "services: {}\n")
  const lockPath = join(releaseRoot, ".release", "release.lock")
  await writeFile(lockPath, `release\t${version}\n`)
  const digest = createHash("sha256").update(await readFile(lockPath)).digest("hex")
  await writeFile(`${lockPath}.sha256`, `${digest}  release.lock\n`)
  await mkdir(join(home, ".data"), { recursive: true })
  await writeFile(
    join(home, ".data", "installed-release.tsv"),
    `LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t${version}\t${relative}\t${digest}\n`,
  )
  return home
}

async function checkForUpdate(home, origin, locale) {
  const env = {
    ...process.env,
    LOSPOR_APPLIANCE_HOME: posix(home),
    HOSPITAL_REGISTRY_ORIGIN: origin,
    HOSPITAL_UPDATE_PACKAGE: "kaloyandjunow-prog/lospor-hospital-api",
    HOSPITAL_UPDATE_TEST_ONLY: "1",
  }
  delete env.LOSPOR_DEFAULT_LOCALE
  if (locale) env.LOSPOR_DEFAULT_LOCALE = locale
  try {
    const { stdout } = await run("sh", [posix(join(root, "scripts", "check-for-update.sh"))], {
      cwd: root,
      env,
    })
    return { code: 0, stdout, stderr: "" }
  } catch (error) {
    // Keep stderr: a failure here is usually the script refusing to start, and
    // without it every assertion below fails identically and says nothing.
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error.message ?? "") }
  }
}

async function recordedState(home) {
  const line = await readFile(join(home, ".data", "update-status.tsv"), "utf8")
  const [header, checkedAt, installed, latest, state, fetched, fetchedLockSha256] = line.trim().split("\t")
  assert.equal(header, "LOSPOR-HOSPITAL-UPDATE-STATUS-V1")
  assert.match(fetchedLockSha256, /^(-|[a-f0-9]{64})$/)
  return { checkedAt, installed, latest, state, fetched, fetchedLockSha256 }
}

test("an unreachable registry records unknown, never current", async () => {
  const home = await applianceHome("1.0.0")
  // Port 1 on loopback: nothing listens, so the connection is refused at once.
  const result = await checkForUpdate(home, "http://127.0.0.1:1")
  assert.equal(result.code, 1, `an unanswerable check must not exit 0 (stderr: ${result.stderr})`)
  const state = await recordedState(home)
  assert.equal(state.state, "unknown")
  assert.notEqual(state.state, "current")
  assert.equal(state.installed, "1.0.0")
  assert.equal(state.latest, "-")
})

test("the token request is anonymous", async () => {
  const tokenAuthorizations = []
  const registry = await fakeRegistry((request, response) => {
    if (request.url.startsWith("/token")) {
      tokenAuthorizations.push(request.headers.authorization)
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ token: REGISTRY_TOKEN }))
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ tags: ["v1.0.0"] }))
  })
  try {
    const home = await applianceHome("1.0.0")
    const result = await checkForUpdate(home, registry.origin)
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(tokenAuthorizations, [undefined])
  } finally {
    await registry.close()
  }
})

test("a registry that refuses an anonymous token records unknown", async () => {
  const registry = await fakeRegistry((request, response) => {
    response.writeHead(403, { "content-type": "application/json" })
    response.end(JSON.stringify({ errors: [{ code: "DENIED" }] }))
  })
  try {
    const home = await applianceHome("1.0.0")
    const result = await checkForUpdate(home, registry.origin)
    assert.equal(result.code, 1)
    assert.equal((await recordedState(home)).state, "unknown")
  } finally {
    await registry.close()
  }
})

test("reports an available update without changing anything", async () => {
  const registry = await tagListRegistry(["v1.0.0", "v1.0.1", "latest"])
  try {
    const home = await applianceHome("1.0.0")
    const result = await checkForUpdate(home, registry.origin)
    assert.equal(result.code, 0, result.stderr)
    const state = await recordedState(home)
    assert.equal(state.state, "update-available")
    assert.equal(state.installed, "1.0.0")
    assert.equal(state.latest, "1.0.1")
    assert.match(result.stdout, /Нищо в тази болнична система не е променено/)

    const english = await checkForUpdate(home, registry.origin, "en")
    assert.equal(english.code, 0)
    assert.match(english.stdout, /Nothing on this appliance has changed/)
  } finally {
    await registry.close()
  }
})

test("reports current when the installed release is the newest", async () => {
  const registry = await tagListRegistry(["v0.9.0", "v1.0.0"])
  try {
    const home = await applianceHome("1.0.0")
    const result = await checkForUpdate(home, registry.origin)
    assert.equal(result.code, 0, result.stderr)
    const state = await recordedState(home)
    assert.equal(state.state, "current")
    assert.equal(state.latest, "1.0.0")
  } finally {
    await registry.close()
  }
})

test("never offers an older release as an update", async () => {
  // A registry still holding 1.0.0 after the site moved to 1.1.0 must not
  // produce an "update" that is really a downgrade.
  const registry = await tagListRegistry(["v1.0.0", "v0.9.0"])
  try {
    const home = await applianceHome("1.1.0")
    const result = await checkForUpdate(home, registry.origin)
    assert.equal(result.code, 0, result.stderr)
    assert.equal((await recordedState(home)).state, "current")
  } finally {
    await registry.close()
  }
})

test("preserves a staged fetch across a later check", async () => {
  const registry = await tagListRegistry(["v1.0.0", "v1.0.1"])
  try {
    const home = await applianceHome("1.0.0")
    await checkForUpdate(home, registry.origin)
    // Simulate run-online-release.sh --fetch-only having staged 1.0.1.
    const path = join(home, ".data", "update-status.tsv")
    const current = (await readFile(path, "utf8")).trim().split("\t")
    current[5] = "1.0.1"
    current[6] = "b".repeat(64)
    await writeFile(path, `${current.join("\t")}\n`)

    await checkForUpdate(home, registry.origin)
    assert.equal((await recordedState(home)).fetched, "1.0.1")
    assert.equal((await recordedState(home)).fetchedLockSha256, "b".repeat(64))
  } finally {
    await registry.close()
  }
})

test("does not follow an authenticated redirect to another origin", async () => {
  let hostileRequests = 0
  const hostile = await fakeRegistry((_request, response) => {
    hostileRequests += 1
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ tags: ["v9.9.9"] }))
  })
  const registry = await fakeRegistry((request, response) => {
    if (request.url.startsWith("/token")) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ token: REGISTRY_TOKEN }))
      return
    }
    response.writeHead(302, { location: `${hostile.origin}/stolen` })
    response.end()
  })
  try {
    const home = await applianceHome("1.0.0")
    const result = await checkForUpdate(home, registry.origin)
    assert.equal(result.code, 1)
    assert.equal(hostileRequests, 0)
    assert.equal((await recordedState(home)).state, "unknown")
  } finally {
    await registry.close()
    await hostile.close()
  }
})

test("refuses cross-origin pagination before sending the bearer token", async () => {
  let hostileRequests = 0
  const hostile = await fakeRegistry((_request, response) => {
    hostileRequests += 1
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ tags: ["v9.9.9"] }))
  })
  const registry = await fakeRegistry((request, response) => {
    if (request.url.startsWith("/token")) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ token: REGISTRY_TOKEN }))
      return
    }
    response.writeHead(200, {
      "content-type": "application/json",
      link: `<${hostile.origin}/stolen>; rel="next"`,
    })
    response.end(JSON.stringify({ tags: ["v1.0.0"] }))
  })
  try {
    const home = await applianceHome("1.0.0")
    const result = await checkForUpdate(home, registry.origin)
    assert.equal(result.code, 1)
    assert.equal(hostileRequests, 0)
    assert.equal((await recordedState(home)).state, "unknown")
  } finally {
    await registry.close()
    await hostile.close()
  }
})
