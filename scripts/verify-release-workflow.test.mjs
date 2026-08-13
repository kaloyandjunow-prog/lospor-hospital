import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { assertReleaseWorkflowContract } from "./release-workflow-contract-lib.mjs"

const [candidate, publisher, quality] = await Promise.all([
  readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/publish-release.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8"),
])

test("accepts the manual integrity-only release and clinical gates", () => {
  assert.equal(assertReleaseWorkflowContract(candidate, publisher, quality), true)
})

test("rejects mutable or undocumented external actions", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace("actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0", "actions/checkout@v6"),
    publisher,
    quality,
  ), /full commit SHA/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace(" # v6.5.0", ""), quality), /readable version comment/)
})

test("rejects every release signature, private-key, public-key and trust-root reference", () => {
  for (const term of [
    "HOSPITAL_RELEASE_SIGNING_KEY_B64: secret",
    "release.lock.sig",
    "release-public.pem",
    "release private key",
    "release public key",
    "release trust root",
    "release signature",
  ]) {
    const tainted = candidate.replace("HOSPITAL_REQUIRE_DIGEST_BUILD_ARGS: \"1\"", `HOSPITAL_REQUIRE_DIGEST_BUILD_ARGS: \"1\"\n      # ${term}`)
    assert.throws(() => assertReleaseWorkflowContract(tainted, publisher, quality), /must not reference signatures.*keys.*trust root/)
  }
})

test("rejects candidate publication authority and automatic publication", () => {
  const candidateWrite = candidate.replace("contents: read\n      packages: write", "contents: write\n      packages: write")
  assert.throws(() => assertReleaseWorkflowContract(candidateWrite, publisher, quality), /must not publish/)
  const automatic = publisher.replace("  workflow_dispatch:\n", "  workflow_run:\n    workflows: [Hospital release]\n")
  assert.throws(() => assertReleaseWorkflowContract(candidate, automatic, quality), /explicitly dispatched|never start automatically/)
})

test("rejects missing exact authorization inputs and private-repository checks", () => {
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("      expected_lock_sha256:", "      ignored_lock_sha256:"), quality), /expected_lock_sha256/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("      confirm_publication:", "      ignored_confirmation:"), quality), /confirm_publication/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("      confirm_immutable_releases:", "      ignored_immutable_confirmation:"), quality), /confirm_immutable_releases/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("PUBLISH hospital-$RELEASE_VERSION", "PUBLISH"), quality), /literal.*confirmation/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("IMMUTABLE RELEASES ENABLED hospital-$RELEASE_VERSION", "ENABLED"), quality), /Immutable Releases was enabled/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("IMMUTABLE RELEASES ENABLED hospital-$VERSION", "ENABLED"), quality), /independently recheck.*Immutable Releases/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("require('$run_json').repository.private", "true"), quality), /private repository/)
  const administrationEndpoint = publisher.replace("gh release view \"$tag\" --json assets", "gh api \"repos/$GITHUB_REPOSITORY/immutable-releases\"\n            gh release view \"$tag\" --json assets")
  assert.throws(() => assertReleaseWorkflowContract(candidate, administrationEndpoint, quality), /Administration-only/)
  const pat = publisher.replace("password: ${{ secrets.GITHUB_TOKEN }}", "password: ${{ secrets.ADMIN_PAT }}")
  assert.throws(() => assertReleaseWorkflowContract(candidate, pat, quality), /must not require a PAT/)
})

test("rejects write authority or mutation before independent verification", () => {
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("packages: read", "packages: write"), quality), /No external write/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("mkdir candidate", "docker push attacker/image\n          mkdir candidate"), quality), /No external write/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("mkdir release-assets", "docker push attacker/image\n          mkdir release-assets"), quality), /before its first external mutation/)
})

test("rejects missing REST digest, safe ZIP, provenance and lock bindings", () => {
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("artifact.workflow_run?.head_sha", "artifact.untrusted"), quality), /artifact.*commit/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace('test "sha256:$(sha256sum "$RUNNER_TEMP/candidate.zip"', 'test "sha256:unverified'), quality), /hash the downloaded/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("verify-actions-artifact-archive.mjs", "skip-archive-check.mjs"), quality), /safe original candidate ZIP/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("artifact.digest !== process.argv[6]", "false"), quality), /REST artifact identity/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("sha256sum --check --strict", "true"), quality), /canonical release.lock/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("verify-release-artifacts.mjs", "skip-artifacts.mjs"), quality), /lock, manifest and artifact/)
})

test("rejects missing integrity installation or exact image identity proofs", () => {
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("Prove integrity-verified online and registry-independent offline installation", "Skip installation proof"), quality), /integrity-verified installation/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("run-online-release.sh", "skip-online.sh"), quality), /checksum-only runtime CLI/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("docker builder prune --all --force", "true"), quality), /remove registry images and build cache/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("all-images.tsv", "unchecked-images.tsv"), quality), /all ten image identities/)
})

test("rejects duplicated or executed candidate payloads", () => {
  const duplicated = publisher.replace("  publish:\n", "      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1\n\n  publish:\n")
  assert.throws(() => assertReleaseWorkflowContract(candidate, duplicated, quality), /must not duplicate/)
  const executesCandidate = publisher.replace("mkdir release-assets", "mkdir release-assets\n          sh release-assets/install.sh")
  assert.throws(() => assertReleaseWorkflowContract(candidate, executesCandidate, quality), /must never execute/)
})

test("rejects wildcard, replacement, partial and non-immutable releases", () => {
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace('"release-assets/$file"', "release-assets/* --clobber"), quality), /wildcard-upload/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("--json isImmutable", "--json isDraft"), quality), /immutability/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("An unpublished or mutable GitHub Release already exists", "Resuming mutable GitHub Release"), quality), /must not resume/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("assert_tag_commit", "skip_tag_check"), quality), /tag-to-commit/)
})

test("keeps restore and all clinical E2E gates", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace('POSTGRES_IMAGE="$HOSPITAL_POSTGRES_SOURCE_IMAGE" sh scripts/test-backup-restore.sh', "true"),
    publisher,
    quality,
  ), /approved PostgreSQL/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher, quality.replace("npm run test:manual-release", "true")), /manual release contracts/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher, quality.replace("npm run e2e:pwa-offline", "true")), /e2e:pwa-offline/)
})
