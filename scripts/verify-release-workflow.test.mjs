import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { assertReleaseWorkflowContract } from "./release-workflow-contract-lib.mjs"

const release = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8")
const quality = await readFile(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8")

test("accepts the complete release and clinical gate", () => {
  assert.equal(assertReleaseWorkflowContract(release, quality), true)
})

test("rejects mutable or undocumented external action references", () => {
  assert.throws(
    () => assertReleaseWorkflowContract(
      release.replace(
        "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0",
        "actions/checkout@v6",
      ),
      quality,
    ),
    /external action must use a full commit SHA/,
  )
  assert.throws(
    () => assertReleaseWorkflowContract(
      release,
      quality.replace(" # v6.5.0", ""),
    ),
    /readable version comment/,
  )
})

test("requires the disposable restore drill in quality and approved-image release gates", () => {
  assert.throws(
    () => assertReleaseWorkflowContract(
      release.replace(
        'POSTGRES_IMAGE="$HOSPITAL_POSTGRES_SOURCE_IMAGE" sh scripts/test-backup-restore.sh',
        "true",
      ),
      quality,
    ),
    /approved PostgreSQL image/,
  )
  assert.throws(
    () => assertReleaseWorkflowContract(
      release,
      quality.replace("run: sh scripts/test-backup-restore.sh", "run: true"),
    ),
    /disposable backup\/restore drill/,
  )
})

test("rejects manual publication and a retry-unstable candidate", () => {
  const manual = release.replace("  push:\n", "  workflow_dispatch:\n  push:\n")
  assert.throws(() => assertReleaseWorkflowContract(manual, quality), /manual dispatch/)
  const unstable = release.replace("$GITHUB_RUN_ID-$build_identity", "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT-$build_identity")
  assert.throws(() => assertReleaseWorkflowContract(unstable, quality), /Candidate identity/)
})

test("rejects promotion before scanning and incomplete clinical E2E", () => {
  const earlyPush = release.replace(
    "Push only missing run-specific private candidates",
    "Push only missing run-specific private candidates (moved)",
  ).replace(
    "Discover candidates already built by an earlier attempt",
    "Push only missing run-specific private candidates",
  )
  assert.throws(() => assertReleaseWorkflowContract(earlyPush, quality), /out of order/)
  assert.throws(
    () => assertReleaseWorkflowContract(release, quality.replace("npm run e2e:pwa-offline", "true")),
    /e2e:pwa-offline/,
  )
})

test("rejects an offline proof that can reuse candidates or build cache", () => {
  assert.throws(
    () => assertReleaseWorkflowContract(release.replace("docker image rm --force $refs $candidates", "docker image rm --force $refs"), quality),
    /candidate references/,
  )
  assert.throws(
    () => assertReleaseWorkflowContract(release.replace("docker builder prune --all --force", "true"), quality),
    /build cache/,
  )
})

test("keeps the trusted public key through both signed installation proofs", () => {
  const prematureDelete = release.replace(
    "rm -f .data/release-keys/private.pem .data/release-keys/derived-public.der .data/release-keys/public.der",
    "rm -f .data/release-keys/private.pem .data/release-keys/public.pem .data/release-keys/derived-public.der .data/release-keys/public.der",
  )
  assert.throws(
    () => assertReleaseWorkflowContract(prematureDelete, quality),
    /public key must remain available/,
  )
})

test("installs each app's exact Playwright browser revision", () => {
  for (const app of ["web", "pwa", "browser"]) {
    const missing = quality.replace(
      new RegExp(`\\n\\s*npm --prefix apps/${app} exec playwright install(?: --with-deps)? chromium`),
      "",
    )
    assert.throws(
      () => assertReleaseWorkflowContract(release, missing),
      new RegExp(`required by ${app}`),
    )
  }
})
