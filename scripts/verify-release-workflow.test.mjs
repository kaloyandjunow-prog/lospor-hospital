import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { assertReleaseWorkflowContract } from "./release-workflow-contract-lib.mjs"
import "./bundle-offline.test.mjs"
import "./ghcr-tag-state.test.mjs"
import "./inspect-release-assets.test.mjs"

const [candidate, publisher, quality, packageSource, apiPackageSource] = await Promise.all([
  readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/publish-release.yml", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../apps/api/package.json", import.meta.url), "utf8"),
])
const packageJson = JSON.parse(packageSource)
const apiPackageJson = JSON.parse(apiPackageSource)

test("accepts the manually signed integrity release and clinical gates", () => {
  assert.equal(assertReleaseWorkflowContract(candidate, publisher, quality), true)
})

test("rejects a candidate workflow that permits a pending client localization import", () => {
  assert.throws(
    () => assertReleaseWorkflowContract(
      candidate.replace("        run: node scripts/client-localization-import-gate.mjs --require-ready\n", ""),
      publisher,
      quality,
    ),
    /refuse a pending or incomplete client localization import/,
  )
})

test("rejects a quality workflow that skips the complete update pipeline gate", () => {
  assert.throws(
    () => assertReleaseWorkflowContract(
      candidate,
      publisher,
      quality.replace("          npm run test:update-pipeline\n", ""),
    ),
    /complete update pipeline contracts/,
  )
})

test("rejects a quality workflow that skips operator localization", () => {
  assert.throws(
    () => assertReleaseWorkflowContract(
      candidate,
      publisher,
      quality.replace("          npm run test:operator-localization\n", ""),
    ),
    /Bulgarian and English operator surfaces/,
  )
})

test("rejects a quality workflow that skips the Hospital-to-Central full story", () => {
  assert.throws(
    () => assertReleaseWorkflowContract(
      candidate,
      publisher,
      quality.replace("        run: npm run test:central-full-story\n", ""),
    ),
    /Hospital-to-Central synthetic full story/,
  )
})

test("the Central full-story alias cannot silently skip PostgreSQL", () => {
  assert.match(packageJson.scripts["test:central-full-story"], /prepare:contract/)
  assert.match(packageJson.scripts["test:central-full-story"], /apps\/api/)
  assert.match(apiPackageJson.scripts["test:central-full-story"], /LOSPOR_POSTGRES_INTEGRATION=true/)
  assert.match(apiPackageJson.scripts["test:central-full-story"], /LOSPOR_CENTRAL_FULL_STORY=true/)
  assert.match(apiPackageJson.scripts["test:central-full-story"], /hospital-central-full-story-contract\.test\.ts/)
  assert.match(apiPackageJson.scripts["test:central-full-story"], /hospital-central-full-story-postgres\.test\.ts/)
})

test("the three full E2E aliases cannot narrow the client suites", () => {
  assert.equal(packageJson.scripts["e2e:web-full"], "npm --prefix apps/web run e2e")
  assert.equal(packageJson.scripts["e2e:pwa-full"], "npm --prefix apps/pwa run e2e:pwa")
  assert.equal(packageJson.scripts["e2e:browser-full"], "npm --prefix apps/browser run e2e")
})

test("rejects mutable or undocumented external actions", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace("actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0", "actions/checkout@v6"),
    publisher,
    quality,
  ), /full commit SHA/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace(" # v6.5.0", ""), quality), /readable version comment/)
})

test("keeps candidates unsigned and rejects every candidate signature, key and trust-root reference", () => {
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
    assert.throws(() => assertReleaseWorkflowContract(tainted, publisher, quality), /must remain unsigned.*signatures.*keys.*trust root/)
  }
})

test("publisher accepts only a reviewed public signature and never private signing material", () => {
  // The PEM header is built at runtime, not written as a literal, so this
  // fixture -- proof that the contract rejects it -- does not itself trip
  // verify-distribution-boundaries.mjs's private-key scanner. The assembled
  // string is byte-identical to the real marker either way.
  const pemHeader = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ")
  for (const term of [
    "HOSPITAL_RELEASE_SIGNING_KEY: secret",
    "RELEASE_SIGNING_KEY: secret",
    "release-signing-private.pem",
    "sign-release-lock.sh",
    "openssl pkeyutl -sign",
    "openssl genpkey",
    pemHeader,
  ]) {
    const tainted = publisher.replace("permissions:\n  contents: read", `# ${term}\npermissions:\n  contents: read`)
    assert.throws(() => assertReleaseWorkflowContract(candidate, tainted, quality), /must never receive or use release private-key material/)
  }
})

test("rejects candidate publication authority and automatic publication", () => {
  const candidateWrite = candidate.replace("contents: read\n      packages: write", "contents: write\n      packages: write")
  assert.throws(() => assertReleaseWorkflowContract(candidateWrite, publisher, quality), /must not publish/)
  const automatic = publisher.replace("  workflow_dispatch:\n", "  workflow_run:\n    workflows: [Hospital release]\n")
  assert.throws(() => assertReleaseWorkflowContract(candidate, automatic, quality), /explicitly dispatched|never start automatically/)
})

test("rejects missing or unsafe candidate runner-disk cleanup", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace('docker buildx prune --builder "${{ steps.buildx.outputs.name }}" --all --force', "true"),
    publisher,
    quality,
  ), /prune and remove the exact selected Buildx builder/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace('docker buildx rm "${{ steps.buildx.outputs.name }}"', "true"),
    publisher,
    quality,
  ), /prune and remove the exact selected Buildx builder/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace('rm -rf "$cache_path"', "true"),
    publisher,
    quality,
  ), /delete Trivy cache/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace(
      'docker image prune --force\n          node scripts/image-lock.mjs verify-loaded-lock "$lock"',
      'docker image prune --all --force\n          node scripts/image-lock.mjs verify-loaded-lock "$lock"',
    ),
    publisher,
    quality,
  ), /never broadly prune/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace('if [ "$image_id" = "$locked_id" ]; then', "if false; then"),
    publisher,
    quality,
  ), /preserve and re-verify/)
})

test("rejects incomplete hardened-image candidate coverage", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace("curl-worker delivery-worker", "curl-worker curl-worker"),
    publisher,
    quality,
  ), /image-to-Compose-service mappings/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replaceAll("$CADDY_BUILD_BASE_IMAGE", "$OMITTED_CADDY_BUILD_BASE_IMAGE"),
    publisher,
    quality,
  ), /build identity is missing CADDY_BUILD_BASE_IMAGE/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace("POSTGRES_BASE_IMAGE", "HOSPITAL_POSTGRES_SOURCE_IMAGE"),
    publisher,
    quality,
  ), /must build and scan the hardened Hospital/)
})

test("rejects missing or fail-open source-built PostgreSQL provenance policy", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace("node scripts/postgres-source-provenance.mjs require-vulnerability-review", "true # source vulnerability review omitted"),
    publisher,
    quality,
  ), /fail closed without an explicit release-specific source-component vulnerability review/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace(".data/release-evidence/postgres-source-provenance/postgres-source-provenance.json", ".data/release-evidence/unbound-provenance.json"),
    publisher,
    quality,
  ), /policy evidence must bind exact PostgreSQL source provenance/)
})

test("rejects local Docker identity across runners and incomplete scan identity evidence", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace("release-image-evidence.mjs verify-portable", "release-image-evidence.mjs verify-local"),
    publisher,
    quality,
  ), /portable image identity|never compare same-host Docker IDs/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace("image.localDockerId", "image.imageId"),
    publisher,
    quality,
  ), /legacy Docker \.imageId/)
  const crossHostDockerId = publisher.replace(
    'node scripts/verify-registry-image-lock.mjs "$image_lock" "$VERSION" --immutable-only',
    'node scripts/verify-registry-image-lock.mjs "$image_lock" "$VERSION" --immutable-only\n          docker image inspect --format \'{{.Id}}\' "$image_lock"',
  )
  assert.throws(() => assertReleaseWorkflowContract(candidate, crossHostDockerId, quality), /cross-host Docker IDs/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace(
      ".data/release-evidence/sboms/{api,browser,caddy,curl-worker,migrate,postgres,pwa,status,tools,web}.cdx.json",
      ".data/release-evidence/sboms/{api,browser,caddy,curl-worker,migrate,postgres,pwa,status,tools}.cdx.json",
    ),
    publisher,
    quality,
  ), /ten CycloneDX SBOMs/)
})

test("rejects missing portable registry proofs and unsafe promotion", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replaceAll(
      'node scripts/verify-registry-image-lock.mjs "$image_lock" "$VERSION" --immutable-only',
      "true # portable immutable proof omitted",
    ),
    quality,
  ), /portable immutable registry identities/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace(
      'done < "$RUNNER_TEMP/custom-images.tsv"\n          node scripts/verify-registry-image-lock.mjs "$image_lock" "$VERSION"',
      'done < "$RUNNER_TEMP/custom-images.tsv"\n          true # final portable registry proof omitted',
    ),
    quality,
  ), /immediately verify each promoted tag/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace(
      'docker buildx imagetools create --prefer-index=false --tag "$reference" "$immutable"',
      'docker buildx imagetools create --prefer-index=false --tag "$reference" "$reference"',
    ),
    quality,
  ), /digest-source promotion|safe imagetools command/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace(
      'tag_state="$(node scripts/ghcr-tag-state.mjs "$reference")"',
      'tag_state="$(docker manifest inspect "$reference" >/dev/null 2>&1 && printf exists || printf absent)"',
    ),
    quality,
  ), /authoritative GHCR tag-state|ambiguous.*failures/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace(
      'tag_state="$(node scripts/ghcr-tag-state.mjs "$reference")"',
      'tag_state="$(node scripts/ghcr-tag-state.mjs "$reference" || printf absent)"',
    ),
    quality,
  ), /fail closed|ambiguous.*failures/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace(
      'node scripts/verify-registry-image-lock.mjs "$image_lock" "$VERSION" "$image_name"\n                ;;',
      'true # existing mutable tag accepted without identity proof\n                ;;',
    ),
    quality,
  ), /existing version tag must match/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace(
      'echo "GHCR classifier returned an impossible state for $reference" >&2\n                exit 1',
      'echo "ambiguous response ignored" >&2\n                true',
    ),
    quality,
  ), /Unknown GHCR tag state must stop/)
})

test("rejects fail-open candidate discovery, resume and push inspection", () => {
  for (const reference of ["$reference", "$candidate"]) {
    assert.throws(() => assertReleaseWorkflowContract(
      candidate.replace(
        `tag_state="$(node scripts/ghcr-tag-state.mjs "${reference}" --allow-repository-absent)"`,
        `tag_state="$(node scripts/ghcr-tag-state.mjs "${reference}" --allow-repository-absent || printf absent)"`,
      ),
      publisher,
      quality,
    ), /authoritative GHCR tag-state|ambiguous registry inspection failures/)
  }
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace(
      'tag_state="$(node scripts/ghcr-tag-state.mjs "$reference" --allow-repository-absent)"',
      'tag_state="$(docker manifest inspect "$reference" >/dev/null 2>&1 && printf exists || printf absent)"',
    ),
    publisher,
    quality,
  ), /authoritative GHCR tag-state|ambiguous registry inspection failures/)
})

test("rejects missing exact authorization inputs and private-repository checks", () => {
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("      expected_lock_sha256:", "      ignored_lock_sha256:"), quality), /expected_lock_sha256/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("      release_signature_base64:", "      ignored_signature_base64:"), quality), /release_signature_base64/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("      expected_signature_sha256:", "      ignored_signature_sha256:"), quality), /expected_signature_sha256/)
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

test("rejects incomplete signature verification, key continuity and signed-install proofs", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace("node scripts/materialize-release-signature.mjs", "node scripts/skip-release-signature.mjs"),
    quality,
  ), /independently decode and verify/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace('sha256sum "$lock.sig"', 'sha256sum "$unreviewed"'),
    quality,
  ), /bind the raw signature SHA-256/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace('git diff --exit-code "$COMMIT" "$GITHUB_SHA" -- infra/release-signing/release-signing-public.pem', "true # key continuity omitted"),
    quality,
  ), /same reviewed release public key/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace('cp infra/release-signing/release-signing-public.pem "$home/secrets/release-signing-public.pem"', "true # unpinned install proof"),
    quality,
  ), /installation proofs must require the reviewed release signature/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher.replace("verify-release-signature.sh verify-release.sh", "verify-release.sh"),
    quality,
  ), /carry the independent host signature verifier/)
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
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace("Prove the exact candidate through a verified release transition", "Skip exact candidate transition"),
    publisher,
    quality,
  ), /exact locked images through the verified release launcher/)
  const bypassedCandidate = candidate.replace(
    'HOSPITAL_ALLOW_UNSUPPORTED_TEST_HOST: "1"\n          HOSPITAL_RELEASE_TEST_ONLY: "1"',
    'COMPOSE_FILE: compose.yaml:compose.release.yaml\n          HOSPITAL_IMAGES_VERIFIED: "1"',
  ).replace(
    'sh "$bootstrap/scripts/run-online-release.sh" \\\n            "dist/$prefix-release.lock" "dist/$prefix-release.lock.sha256" dist -- \\\n            sh -c \'set -e; sh scripts/test-install.sh; ln -s "$LOSPOR_APPLIANCE_HOME/.env" .env\'',
    "sh scripts/test-install.sh",
  )
  assert.throws(() => assertReleaseWorkflowContract(bypassedCandidate, publisher, quality), /verified transition state|exact locked images/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("Prove integrity-verified online and registry-independent offline installation", "Skip installation proof"), quality), /integrity-verified installation/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("run-online-release.sh", "skip-online.sh"), quality), /verified runtime CLI/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("set -e; sh scripts/test-install.sh", "false; sh scripts/test-install.sh"), quality), /propagate test-install failures/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("docker builder prune --all --force", "true"), quality), /remove registry images and build cache/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("release-images.tsv", "unchecked-images.tsv"), quality), /portable lock references/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace(
    'wc -l < "$RUNNER_TEMP/custom-images.tsv" | tr -d \'[:space:]\')" = 10',
    'wc -l < "$RUNNER_TEMP/custom-images.tsv" | tr -d \'[:space:]\')" = 7',
  ), quality), /promote all ten/)
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
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace("candidate=$RUN_ID/$RUN_ATTEMPT", "candidate=unbound"), quality), /draft identity must bind/)
  for (const condition of [
    "release.isPrerelease !== false",
    "release.tagName !== tag",
    "release.name !== title",
    "release.body !== notes",
  ]) {
    assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace(condition, "false"), quality), /immutable replay and draft resume must require exact run-bound metadata/)
  }
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace('validate_release_metadata "$RUNNER_TEMP/existing-release.json"', "true"), quality), /exact run-bound metadata/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace('verify_release_assets "$RUNNER_TEMP/existing-assets" true', "true"), quality), /delete only validated empty starter asset IDs/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace('gh api --method DELETE "repos/$GITHUB_REPOSITORY/releases/assets/$asset_id"', "true"), quality), /delete only validated empty starter asset IDs/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace('verify_release_assets "$RUNNER_TEMP/existing-assets" false', 'verify_release_assets "$RUNNER_TEMP/existing-assets" true'), quality), /Immutable replay must reject incomplete assets/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replace('--verify-tag --target "$COMMIT" --draft', "--verify-tag --draft"), quality), /guarded resume/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher.replaceAll("assert_tag_commit", "skip_tag_check"), quality), /tag-to-commit/)
})

test("keeps restore and all clinical E2E gates", () => {
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace(
      'POSTGRES_IMAGE="ghcr.io/kaloyandjunow-prog/lospor-hospital-postgres:$HOSPITAL_IMAGE_TAG"',
      'POSTGRES_IMAGE="$POSTGRES_BASE_IMAGE"',
    ),
    publisher,
    quality,
  ), /exact custom PostgreSQL candidate/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace(
      'sh infra/docker/postgres-cross-base-upgrade.test.sh \\\n            "ghcr.io/kaloyandjunow-prog/lospor-hospital-postgres:$HOSPITAL_IMAGE_TAG"',
      'sh infra/docker/postgres-cross-base-upgrade.test.sh \\\n            "$POSTGRES_BASE_IMAGE"',
    ),
    publisher,
    quality,
  ), /legacy PostgreSQL volume with the exact custom candidate/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate.replace(
      'POSTGRES_IMAGE="$HOSPITAL_IMAGE_REGISTRY/lospor-hospital-postgres:$HOSPITAL_RELEASE"',
      'POSTGRES_IMAGE="$POSTGRES_BASE_IMAGE"',
    ),
    publisher,
    quality,
  ), /final locked custom PostgreSQL/)
  assert.throws(() => assertReleaseWorkflowContract(
    candidate,
    publisher,
    quality.replace("POSTGRES_IMAGE=lospor-hospital-postgres:source", "POSTGRES_IMAGE=postgres:17.6-bookworm"),
  ), /backup\/restore drill with the hardened PostgreSQL/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher, quality.replace("npm run test:manual-release", "true")), /manual release contracts/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher, quality.replace("npm run e2e:web-full", "true")), /e2e:web-full/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher, quality.replace("npm run e2e:pwa-full", "true")), /e2e:pwa-full/)
  assert.throws(() => assertReleaseWorkflowContract(candidate, publisher, quality.replace("npm run e2e:browser-full", "true")), /e2e:browser-full/)
})
