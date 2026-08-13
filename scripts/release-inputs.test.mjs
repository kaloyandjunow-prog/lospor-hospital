import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { parseReleaseInputs, releaseEnvironmentLines } from "./release-inputs.mjs"

const real = JSON.parse(await readFile(new URL("../release-inputs.json", import.meta.url), "utf8"))

test("accepts the committed linux/amd64 release inputs and emits every build variable", () => {
  const parsed = parseReleaseInputs(real)
  assert.equal(parsed.platform, "linux/amd64")
  const lines = releaseEnvironmentLines(parsed)
  assert.equal(lines.length, 10)
  assert(lines.includes(`NODE_API_BASE_IMAGE=${real.images.node}`))
  assert(lines.includes(`HOSPITAL_POSTGRES_SOURCE_IMAGE=${real.images.postgres}`))
  assert(lines.includes(`TRIVY_IMAGE=${real.images.trivy}`))
})

test("rejects mutable tags, wrong repositories, wrong platforms and extra inputs", () => {
  const mutable = structuredClone(real)
  mutable.images.node = "node:24-bookworm-slim"
  assert.throws(() => parseReleaseInputs(mutable), /node.*sha256/)
  const attacker = structuredClone(real)
  attacker.images.caddy = `ghcr.io/attacker/caddy@sha256:${"a".repeat(64)}`
  assert.throws(() => parseReleaseInputs(attacker), /caddy.*sha256/)
  const platform = structuredClone(real)
  platform.platform = "linux/arm64"
  assert.throws(() => parseReleaseInputs(platform), /linux\/amd64/)
  const extra = structuredClone(real)
  extra.images.unreviewed = `example.invalid/image@sha256:${"b".repeat(64)}`
  assert.throws(() => parseReleaseInputs(extra), /unexpected or missing/)
})
