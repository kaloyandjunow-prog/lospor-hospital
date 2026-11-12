import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

// 2026-11-10: snapshot.debian.org answered 503 for single files, and the PostgreSQL image build gave up on the first
// one: three candidate builds in a row. apt now tries again, and after the second failure asks the CDN host of the
// same snapshot. The tests run the function exactly as the Dockerfile has it, with apt-get and sleep replaced.

const dockerfile = readFileSync(new URL("../infra/docker/postgres.Dockerfile", import.meta.url), "utf8").replace(/\r\n/g, "\n")
const functions = [...dockerfile.matchAll(/^    apt_retry\(\) \{ \\\n([\s\S]*?)^    \}; \\$/gm)].map(match => match[1].replace(/ \\$/gm, ""))

function run(failures, attemptsAllowed = 6) {
  const dir = mkdtempSync(join(tmpdir(), "apt-retry-")).split("\\").join("/")
  const sources = `${dir}/debian.sources`
  writeFileSync(sources, "Types: deb\nURIs: http://snapshot.debian.org/archive/debian/20261003T000000Z\n")
  // Stubs are real executables: a function named apt-get is not valid in dash, which is what the image runs.
  const bin = `${dir}/bin`
  mkdirSync(bin)
  writeFileSync(`${bin}/sleep`, `#!/bin/sh
echo "sleep $1" >> "${dir}/log"
`, { mode: 0o755 })
  writeFileSync(`${bin}/apt-get`, `#!/bin/sh
count=$(cat "${dir}/count" 2>/dev/null || echo 0); count=$((count + 1)); echo $count > "${dir}/count"
echo "apt-get attempt $count host $(grep -o "snapshot[a-z-]*.debian.org" "${sources}")" >> "${dir}/log"
[ "$count" -gt ${failures} ]
`, { mode: 0o755 })
  const script = `
set -eu
PATH="${bin}:$PATH"
apt_retry() {
${functions[0].replace(/\/etc\/apt\/sources\.list\.d\/debian\.sources/g, sources)}
}
apt_retry apt-get update
`
  const result = spawnSync("sh", ["-c", script], { encoding: "utf8" })
  return { status: result.status, log: readFileSync(`${dir}/log`, "utf8").trim().split("\n"), sources: readFileSync(sources, "utf8") }
}

test("both stages that install packages retry, and tell apt to retry each file", () => {
  assert.equal(functions.length, 2, "the builder and the runtime stage each carry apt_retry")
  assert.equal(functions[0], functions[1])
  assert.equal((dockerfile.match(/^    apt-get /gm) ?? []).length, 0, "no apt-get runs outside apt_retry")
  assert.equal((dockerfile.match(/-o Acquire::Retries=5/g) ?? []).length, 4, "update and install, in both stages")
})

test("a first failure is tried again on the same host, a second moves to the CDN host of the same snapshot", () => {
  const once = run(1)
  assert.equal(once.status, 0)
  assert.deepEqual(once.log.filter(line => line.startsWith("apt-get")), [
    "apt-get attempt 1 host snapshot.debian.org",
    "apt-get attempt 2 host snapshot.debian.org",
  ])
  const result = run(2)
  assert.equal(result.status, 0)
  assert.deepEqual(result.log.filter(line => line.startsWith("apt-get")), [
    "apt-get attempt 1 host snapshot.debian.org",
    "apt-get attempt 2 host snapshot.debian.org",
    "apt-get attempt 3 host snapshot-cloudflare.debian.org",
  ])
  assert.match(result.sources, /snapshot-cloudflare\.debian\.org\/archive\/debian\/20261003T000000Z/, "the same snapshot, only the host changes")
})

test("it waits longer after each failure and stops after the sixth", () => {
  const result = run(99)
  assert.notEqual(result.status, 0)
  assert.deepEqual(result.log.filter(line => line.startsWith("sleep")), ["sleep 15", "sleep 30", "sleep 45", "sleep 60", "sleep 75"])
  assert.equal(result.log.filter(line => line.startsWith("apt-get")).length, 6)
})

test("nothing is retried when the first try works", () => {
  const result = run(0)
  assert.equal(result.status, 0)
  assert.deepEqual(result.log, ["apt-get attempt 1 host snapshot.debian.org"])
})

test("the pinned snapshot is still what the sources are checked against before anything is installed", () => {
  for (const snapshot of ["archive/debian/20261003T000000Z", "archive/debian-security/20261003T000000Z"]) {
    const check = dockerfile.indexOf(`grep -Fq 'snapshot.debian.org/${snapshot}'`)
    assert.ok(check > 0, `${snapshot} is no longer checked`)
    assert.ok(check < dockerfile.indexOf("apt_retry apt-get"), "the check comes before the first install")
  }
})
