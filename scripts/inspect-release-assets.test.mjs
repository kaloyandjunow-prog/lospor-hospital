import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { inspectReleaseAssets } from "./inspect-release-assets.mjs"

const sha256 = value => `sha256:${createHash("sha256").update(value).digest("hex")}`

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "hospital-release-assets-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, "appliance.tar.gz"), "approved-bytes")
  await writeFile(join(directory, "release.lock"), "lock")
  return directory
}

test("accepts completed exact assets and reports a safe empty starter only in draft mode", async t => {
  const directory = await fixture(t)
  const release = {
    assets: [
      { id: 101, name: "appliance.tar.gz", state: "uploaded", size: 14, digest: sha256("approved-bytes") },
      { id: 102, name: "release.lock", state: "starter", size: 0, digest: null },
    ],
  }
  assert.deepEqual(await inspectReleaseAssets(release, directory, true), {
    uploaded: ["appliance.tar.gz"],
    starter: [{ id: 102, name: "release.lock" }],
  })
  await assert.rejects(inspectReleaseAssets(release, directory, false), /not a completed upload/)
})

test("rejects partial, ambiguous and tampered release assets", async t => {
  const directory = await fixture(t)
  const invalidAssets = [
    { id: 1, name: "release.lock", state: "starter", size: 1, digest: null },
    { id: 1, name: "release.lock", state: "starter", size: 0, digest: sha256("") },
    { id: 1, name: "release.lock", state: "open", size: 0, digest: null },
    { id: 1, name: "appliance.tar.gz", state: "uploaded", size: 13, digest: sha256("approved-bytes") },
    { id: 1, name: "appliance.tar.gz", state: "uploaded", size: 14, digest: sha256("wrong") },
    { id: 1, name: "unexpected.zip", state: "uploaded", size: 0, digest: null },
    { id: "node-id", name: "release.lock", state: "starter", size: 0, digest: null },
  ]
  for (const asset of invalidAssets) {
    await assert.rejects(inspectReleaseAssets({ assets: [asset] }, directory, true))
  }
})
