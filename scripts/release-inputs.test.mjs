import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { parseReleaseInputs, releaseEnvironmentLines } from "./release-inputs.mjs"

const real = JSON.parse(await readFile(new URL("../release-inputs.json", import.meta.url), "utf8"))

test("accepts the committed linux/amd64 release inputs and emits every build variable", () => {
  const parsed = parseReleaseInputs(real)
  assert.equal(parsed.platform, "linux/amd64")
  assert.equal(parsed.schemaVersion, 3)
  assert.equal(parsed.postgresSource.components.postgresql.version, "17.11")
  const lines = releaseEnvironmentLines(parsed)
  assert.equal(lines.length, 11)
  assert(lines.includes(`NODE_API_BASE_IMAGE=${real.images.node}`))
  assert(lines.includes(`POSTGRES_BASE_IMAGE=${real.images.postgres}`))
  assert(lines.includes(`CADDY_BUILD_BASE_IMAGE=${real.images.caddyBuilder}`))
  assert(lines.includes(`CADDY_RUNTIME_BASE_IMAGE=${real.images.caddyRuntime}`))
  assert(lines.includes(`TRIVY_IMAGE=${real.images.trivy}`))
})

test("rejects mutable tags, wrong repositories, wrong platforms and extra inputs", () => {
  const mutable = structuredClone(real)
  mutable.images.node = "node:24-alpine3.24"
  assert.throws(() => parseReleaseInputs(mutable), /node.*sha256/)
  const incompatiblePostgres = structuredClone(real)
  incompatiblePostgres.images.postgres = `postgres:17.11-alpine3.24@sha256:${"c".repeat(64)}`
  assert.throws(() => parseReleaseInputs(incompatiblePostgres), /postgres.*17\.11-bookworm/)
  const attacker = structuredClone(real)
  attacker.images.caddyRuntime = `ghcr.io/attacker/caddy@sha256:${"a".repeat(64)}`
  assert.throws(() => parseReleaseInputs(attacker), /caddyRuntime.*sha256/)
  const platform = structuredClone(real)
  platform.platform = "linux/arm64"
  assert.throws(() => parseReleaseInputs(platform), /linux\/amd64/)
  const extra = structuredClone(real)
  extra.images.unreviewed = `example.invalid/image@sha256:${"b".repeat(64)}`
  assert.throws(() => parseReleaseInputs(extra), /unexpected or missing/)
  const source = structuredClone(real)
  source.postgresSource.components.zlib.sha256 = "0".repeat(64)
  assert.notEqual(source.postgresSource.components.zlib.sha256, real.postgresSource.components.zlib.sha256)
  source.postgresSource.components.zlib.extra = "unreviewed"
  assert.throws(() => parseReleaseInputs(source), /unexpected or missing/)
  const record = structuredClone(real)
  record.postgresSource.embeddedRecordSha256.compiler = "NOT-A-SHA"
  assert.throws(() => parseReleaseInputs(record), /compiler.*invalid/)
})
