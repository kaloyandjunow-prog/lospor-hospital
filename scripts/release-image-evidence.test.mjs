import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { REQUIRED_IMAGE_NAMES, expectedImageReference } from "./release-artifacts-lib.mjs"

const version = "1.0.0"
const commit = "a".repeat(40)
const id = index => `sha256:${String(index).repeat(64)}`

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hospital-evidence-"))
  const ledgerPath = join(directory, "ledger.json")
  const images = REQUIRED_IMAGE_NAMES.map((name, index) => ({
    name,
    scanReference: ["caddy", "curl-worker", "postgres"].includes(name)
      ? `${expectedImageReference(name, version)}@${id((index + 1) % 10)}`
      : `ghcr.io/kaloyandjunow-prog/lospor-hospital-${name}:candidate-${commit}-12345-${"f".repeat(16)}`,
    imageId: id(index),
    platform: "linux/amd64",
  }))
  await writeFile(ledgerPath, JSON.stringify({ schemaVersion: 1, version, gitCommit: commit, images }))
  const reports = []
  for (const image of images) {
    const path = join(directory, `${image.name}.json`)
    await writeFile(path, JSON.stringify({ ArtifactName: image.scanReference, ArtifactID: image.imageId, Results: [] }))
    reports.push(path)
  }
  const lockPath = join(directory, "lock.json")
  await writeFile(lockPath, JSON.stringify({ schemaVersion: 1, images: images.map((image, index) => ({
    name: image.name,
    reference: expectedImageReference(image.name, version),
    digest: id((index + 1) % 10),
    imageId: image.imageId,
    platform: image.platform,
  })) }))
  const run = (...args) => execFileSync(process.execPath, ["scripts/release-image-evidence.mjs", ...args], {
    env: {
      ...process.env,
      GITHUB_SHA: commit,
      HOSPITAL_CANDIDATE_TAG: `candidate-${commit}-12345-${"f".repeat(16)}`,
      HOSPITAL_CADDY_SOURCE_IMAGE: `caddy:2.10.2-alpine@${id(3)}`,
      HOSPITAL_CURL_SOURCE_IMAGE: `curlimages/curl:8.17.0@${id(4)}`,
      HOSPITAL_POSTGRES_SOURCE_IMAGE: `postgres:17.6-bookworm@${id(6)}`,
    },
    stdio: "pipe",
  })
  return { directory, ledgerPath, reports, lockPath, run }
}

test("binds all ten scan reports and the eventual image lock to the same IDs", async () => {
  const f = await fixture()
  assert.doesNotThrow(() => f.run("verify-scans", version, f.ledgerPath, ...f.reports))
  const proof = join(f.directory, "candidate-evidence.tsv")
  assert.doesNotThrow(() => f.run("mark-policy-passed", version, f.ledgerPath, proof))
  assert.doesNotThrow(() => f.run("verify-prior", version, f.ledgerPath, proof))
  assert.doesNotThrow(() => f.run("verify-lock", version, f.ledgerPath, f.lockPath))
})

test("rejects a scan report or registry lock whose image ID changes", async () => {
  const f = await fixture()
  const badReport = JSON.parse(await (await import("node:fs/promises")).readFile(f.reports[0], "utf8"))
  badReport.ArtifactID = id(9)
  await writeFile(f.reports[0], JSON.stringify(badReport))
  assert.throws(() => f.run("verify-scans", version, f.ledgerPath, ...f.reports), /Command failed/)
  const f2 = await fixture()
  const badLock = JSON.parse(await (await import("node:fs/promises")).readFile(f2.lockPath, "utf8"))
  badLock.images[0].imageId = id(9)
  await writeFile(f2.lockPath, JSON.stringify(badLock))
  assert.throws(() => f2.run("verify-lock", version, f2.ledgerPath, f2.lockPath), /Command failed/)
})

test("rejects tampered or differently namespaced prior candidate evidence", async () => {
  const f = await fixture()
  const proof = join(f.directory, "candidate-evidence.tsv")
  f.run("mark-policy-passed", version, f.ledgerPath, proof)
  await writeFile(proof, `${await (await import("node:fs/promises")).readFile(proof, "utf8")}tampered\n`)
  assert.throws(() => f.run("verify-prior", version, f.ledgerPath, proof), /Command failed/)
})
