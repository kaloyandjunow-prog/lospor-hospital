const ALL = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]
const RELEASE_SIGNATURE_TERMS = /signature|signing|private[ _-]?key|public[ _-]?key|trust[ _-]?root|release\.lock\.sig|release-public\.pem|release-trust\.json|HOSPITAL_RELEASE_SIGNING_KEY/i

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

function forbidPattern(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message)
}

function ordered(text, markers, label) {
  let cursor = -1
  for (const marker of markers) {
    const next = text.indexOf(marker)
    if (next < 0 || next <= cursor) throw new Error(`${label} stage is missing or out of order: ${marker}`)
    cursor = next
  }
}

function assertPinnedExternalActions(workflow, label) {
  const lines = workflow.split("\n")
  let actionCount = 0
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.+))?\s*$/)
    if (!match) continue
    if (match[1].startsWith("./")) continue
    actionCount += 1
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/.test(match[1])) {
      throw new Error(`${label} external action must use a full commit SHA on line ${index + 1}: ${match[1]}`)
    }
    if (!/^v[0-9]+\.[0-9]+\.[0-9]+(?:\s|$)/.test(match[2] ?? "")) {
      throw new Error(`${label} pinned action must retain a readable version comment on line ${index + 1}: ${match[1]}`)
    }
  }
  if (actionCount === 0) throw new Error(`${label} contains no external actions to verify`)
}

function triggerBlock(workflow) {
  const end = workflow.indexOf("\npermissions:")
  if (end < 0) throw new Error("Workflow has no top-level permissions block")
  return workflow.slice(0, end)
}

export function assertReleaseWorkflowContract(candidate, publisher, quality) {
  assertPinnedExternalActions(candidate, "Candidate workflow")
  assertPinnedExternalActions(publisher, "Publication workflow")
  assertPinnedExternalActions(quality, "Quality workflow")
  forbidPattern(`${candidate}\n${publisher}`, RELEASE_SIGNATURE_TERMS, "Release workflows must not reference signatures, release keys or a release trust root")

  const candidateTrigger = triggerBlock(candidate)
  requirePattern(candidateTrigger, /push:\s*\n\s*tags:\s*\n\s*- "hospital-\*"/, "Candidate workflow must run only for Hospital tags")
  forbidPattern(candidateTrigger, /workflow_dispatch\s*:|workflow_run\s*:/, "Candidate workflow must not expose manual or automatic publication triggers")
  requirePattern(candidate, /cancel-in-progress:\s*false/, "Candidate runs must never cancel one another")
  requirePattern(candidate, /\n\s*candidate:\s*\n/, "Tag workflow must produce a candidate")
  forbidPattern(candidate, /environment:\s*hospital-release|contents:\s*write|gh release/, "Candidate workflow must not publish a GitHub Release")
  requirePattern(candidate, /node scripts\/release-inputs\.mjs env release-inputs\.json/, "Candidate build inputs must be committed and digest-pinned")
  requirePattern(candidate, /create-release-handoff\.mjs[\s\S]*publication-request\.tsv/, "Candidate must create the exact manual publication request")
  requirePattern(candidate, /printf '%s  %s\\n' "\$lock_sha256" "\$lock_name" > "\$lock\.sha256"[\s\S]*sha256sum --check --strict "\$lock_name\.sha256"/, "Candidate must create and check the canonical release.lock SHA-256 sidecar")
  requirePattern(candidate, /hospital-\$\{\{ needs\.metadata\.outputs\.version \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-candidate/, "Candidate artifact name must bind version, run ID and run attempt")
  requirePattern(candidate, /retention-days:\s*14\s*\n\s*compression-level:\s*0/, "Candidate retention must be bounded without recompressing multi-GB payloads")
  requirePattern(candidate, /candidate-\$GITHUB_SHA-\$GITHUB_RUN_ID-\$build_identity/, "Candidate identity must bind commit, run and build inputs")
  requirePattern(candidate, /verify-prior/, "Existing candidates must match durable prior evidence")
  requirePattern(candidate, /mark-policy-passed/, "Candidates must retain proof that scan policy passed before push")
  if (/HOSPITAL_(?:IMAGE_TAG|CANDIDATE_TAG):[^\n]*run_attempt/i.test(candidate)) throw new Error("Candidate identity must be stable across rerun attempts")
  ordered(candidate, [
    "Require approved digest-pinned build, runtime and scanner images",
    "Discover candidates already built by an earlier attempt",
    "Build each missing custom candidate exactly once",
    "Record all ten pre-push image IDs",
    "Scan all ten candidate images and create SBOM evidence",
    "Push only missing run-specific private candidates",
    "Remove local candidates and re-pull exact registry identities",
    "Test migrations with the exact re-pulled candidate image",
    "Test exact registry candidates as a clean appliance",
    "Build deployment kit and split offline bundle from tested identities",
    "Create canonical JSON manifest and host-verifiable release lock",
    "Create the canonical lock checksum and publication request",
    "Upload the release candidate for manual publication",
  ], "Candidate workflow")
  for (const name of ALL) requirePattern(candidate, new RegExp(`\\n\\s*scan ${name.replace("-", "\\-")} `), `Candidate workflow does not scan ${name}`)

  const publisherTrigger = triggerBlock(publisher)
  requirePattern(publisherTrigger, /workflow_dispatch\s*:/, "Publication must be explicitly dispatched")
  forbidPattern(publisherTrigger, /\npush\s*:|workflow_run\s*:|schedule\s*:/, "Publication must never start automatically")
  for (const input of ["candidate_run_id", "candidate_run_attempt", "version", "expected_lock_sha256", "confirm_publication", "confirm_immutable_releases"]) {
    requirePattern(publisherTrigger, new RegExp(`\\n\\s*${input}:`), `Publication is missing required input ${input}`)
  }
  requirePattern(publisher, /test "\$CONFIRM_PUBLICATION" = "PUBLISH hospital-\$RELEASE_VERSION"/, "Read-only verification must require the literal version-bound publication confirmation")
  requirePattern(publisher, /test "\$CONFIRM_PUBLICATION" = "PUBLISH hospital-\$VERSION"/, "Write job must independently recheck the literal publication confirmation")
  requirePattern(publisher, /test "\$CONFIRM_IMMUTABLE_RELEASES" = "IMMUTABLE RELEASES ENABLED hospital-\$RELEASE_VERSION"/, "Read-only verification must require confirmation that Immutable Releases was enabled for this version")
  requirePattern(publisher, /test "\$CONFIRM_IMMUTABLE_RELEASES" = "IMMUTABLE RELEASES ENABLED hospital-\$VERSION"/, "Write job must independently recheck the version-bound Immutable Releases confirmation")
  forbidPattern(publisher, /repos\/\$GITHUB_REPOSITORY\/immutable-releases/, "Publisher must not require the Administration-only Immutable Releases settings endpoint")
  const publisherSecrets = [...publisher.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)].map(match => match[1])
  if (publisherSecrets.some(name => name !== "GITHUB_TOKEN")) throw new Error("Publisher must not require a PAT, admin token or release key")
  requirePattern(publisher, /permissions:\s*\n\s*contents:\s*read/, "Publication workflow must default to read-only")
  requirePattern(publisher, /\n\s*verify:\s*\n/, "Publication must have a read-only verification job")
  requirePattern(publisher, /\n\s*publish:\s*\n\s*needs:\s*verify/, "Write-enabled publication must depend on verification")
  const publishJob = publisher.indexOf("\n  publish:\n")
  if (publishJob < 0) throw new Error("Publication job is missing")
  const verifySection = publisher.slice(0, publishJob)
  const writeSection = publisher.slice(publishJob)
  forbidPattern(verifySection, /contents:\s*write|packages:\s*write|gh release (?:create|upload|edit)|docker push/, "No external write is allowed before independent verification")
  requirePattern(writeSection, /contents:\s*write[\s\S]*packages:\s*write/, "Publication job needs narrowly scoped release and package writes")
  const mutationMarker = writeSection.indexOf("Promote exact verified image identities without rebuilding")
  if (mutationMarker < 0) throw new Error("Publication promotion stage is missing")
  forbidPattern(writeSection.slice(0, mutationMarker), /docker push|gh release (?:create|upload|edit)|gh api[^\n]*(?:--method|-X)\s*(?:POST|PUT|PATCH|DELETE)/i, "Write-capable job must finish independent verification before its first external mutation")
  requirePattern(publisher, /github\.event\.repository\.visibility[\s\S]*test "\$REPOSITORY_VISIBILITY" = private/, "Both jobs must enforce the private repository boundary")
  const privateRunChecks = publisher.match(/require\('\$run_json'\)\.repository\.private/g) ?? []
  if (privateRunChecks.length < 2) throw new Error("Both jobs must bind the candidate run to the private repository")
  const defaultBranchGuards = publisher.match(/test "\$GITHUB_REF" = refs\/heads\/main/g) ?? []
  if (defaultBranchGuards.length < 2) throw new Error("Both jobs must run only from the default branch")
  const checkouts = publisher.match(/ref:\s*\$\{\{ github\.sha \}\}/g) ?? []
  if (checkouts.length < 2) throw new Error("Publisher jobs must execute the immutable workflow-dispatch commit")
  const workflowChecks = publisher.match(/test "\$workflow_path" = \.github\/workflows\/release\.yml/g) ?? []
  if (workflowChecks.length < 2) throw new Error("Both jobs must verify the candidate workflow identity")
  const artifactCommitBindings = publisher.match(/artifact\.workflow_run\?\.head_sha/g) ?? []
  if (artifactCommitBindings.length < 2) throw new Error("Both jobs must bind the original candidate artifact to its workflow commit")
  requirePattern(writeSection, /EXPECTED_ARTIFACT_ID:\s*\$\{\{ needs\.verify\.outputs\.candidate_artifact_id \}\}[\s\S]*EXPECTED_ARTIFACT_DIGEST:\s*\$\{\{ needs\.verify\.outputs\.candidate_artifact_digest \}\}/, "Write job must receive the exact verified artifact identity")
  requirePattern(writeSection, /String\(artifact\.id\) !== process\.argv\[5\] \|\| artifact\.digest !== process\.argv\[6\]/, "Write job must compare the independently fetched REST artifact identity")
  const archiveHashes = publisher.match(/sha256:\$\(sha256sum "\$RUNNER_TEMP\/candidate\.zip"/g) ?? []
  if (archiveHashes.length < 2) throw new Error("Both jobs must hash the downloaded candidate artifact")
  const archiveChecks = publisher.match(/verify-actions-artifact-archive\.mjs/g) ?? []
  if (archiveChecks.length < 2) throw new Error("Both jobs must validate the safe original candidate ZIP before extraction")
  const handoffChecks = publisher.match(/verify-release-handoff\.mjs/g) ?? []
  if (handoffChecks.length < 2) throw new Error("Both jobs must verify the candidate publication request")
  const lockChecks = publisher.match(/sha256sum --check --strict/g) ?? []
  if (lockChecks.length < 2) throw new Error("Both jobs must verify the canonical release.lock SHA-256 sidecar")
  const manifestChecks = publisher.match(/verify-release-artifacts\.mjs/g) ?? []
  if (manifestChecks.length < 2) throw new Error("Both jobs must bind lock, manifest and artifact identities")
  const candidateCommitTagChecks = publisher.match(/test "\$ref_sha" = "\$candidate_commit"/g) ?? []
  if (candidateCommitTagChecks.length < 3) throw new Error("Both jobs must bind the Hospital tag to the candidate commit")
  requirePattern(verifySection, /docker\/login-action@[a-f0-9]{40}[\s\S]*registry:\s*ghcr\.io/, "Read-only verification must authenticate to private GHCR candidates")
  requirePattern(publisher, /Prove integrity-verified online and registry-independent offline installation/, "Publisher must run both integrity-verified installation proofs")
  requirePattern(publisher, /run-online-release\.sh[\s\S]{0,180}release\.lock\.sha256[\s\S]*load-offline\.sh[\s\S]{0,180}release\.lock\.sha256/, "Installation proofs must use the checksum-only runtime CLI")
  requirePattern(publisher, /docker builder prune --all --force[\s\S]*docker image prune --all --force/, "Offline proof must remove registry images and build cache")
  forbidPattern(publisher, /actions\/upload-artifact|verified-release-assets/, "Publication must not duplicate the multi-GB candidate as a second Actions artifact")
  requirePattern(writeSection, /verify-release-candidate\.mjs "\$VERSION" release-assets candidate-assets "\$candidate_commit"[\s\S]*rm "release-assets\/\$prefix-images\.json" "release-assets\/\$prefix-publication-request\.tsv"[\s\S]*verify-release-candidate\.mjs "\$VERSION" release-assets final-assets "\$candidate_commit"/, "Write job must independently reduce the exact candidate to the final asset set")
  forbidPattern(writeSection, /(?:^|\n)\s*(?:bash|sh|node)\s+["']?release-assets\//, "Write job must never execute code extracted from the candidate artifact")
  requirePattern(writeSection, /all-images\.tsv[\s\S]*image_id platform[\s\S]*\$image_id \$platform/, "Publisher must re-verify all ten image identities after promotion")
  requirePattern(writeSection, /gh release edit "\$tag" --draft=false[\s\S]*gh release view "\$tag" --json isImmutable --jq '\.isImmutable == true'/, "Publisher must verify post-publication immutability through the release API")
  const finalTagChecks = writeSection.match(/assert_tag_commit/g) ?? []
  if (finalTagChecks.length < 3) throw new Error("Publisher must define and repeat the exact tag-to-commit check")
  requirePattern(publisher, /Exact immutable release already exists; publication is an idempotent no-op/, "Publisher must accept only an exact immutable replay")
  requirePattern(publisher, /An unpublished or mutable GitHub Release already exists[\s\S]{0,180}exit 1/, "Publisher must not resume a partial mutable GitHub Release")
  forbidPattern(publisher, /dist\/\*|release-assets\/\*|--clobber/, "Publisher must never wildcard-upload or replace release assets")
  requirePattern(writeSection, /while IFS= read -r file; do[\s\S]{0,300}gh release upload "\$tag" "release-assets\/\$file"/, "Publisher must upload the exact verified final asset allowlist")
  ordered(publisher, [
    "Verify the exact successful candidate run and artifact",
    "Verify publication request, lock, manifest and exact candidate assets",
    "Verify all ten private-registry image identities",
    "Prove integrity-verified online and registry-independent offline installation",
    "Re-download and independently verify the original candidate before writes",
    "Promote exact verified image identities without rebuilding",
    "Create exact immutable GitHub Release",
  ], "Publication workflow")

  requirePattern(candidate, /POSTGRES_IMAGE="\$HOSPITAL_POSTGRES_SOURCE_IMAGE" sh scripts\/test-backup-restore\.sh/, "Candidate must restore a real backup with the approved PostgreSQL image")
  requirePattern(quality, /run:\s*sh scripts\/test-backup-restore\.sh/, "Quality workflow must run the disposable backup/restore drill")
  requirePattern(quality, /npm run test:manual-release/, "Quality workflow must gate the manual release contracts")
  for (const command of ["e2e:clinical-golden", "e2e:pwa-offline", "e2e:browser-authenticated"]) {
    requirePattern(quality, new RegExp(`npm run ${command.replace(":", "\\:")}`), `Quality workflow does not gate ${command}`)
  }
  for (const app of ["web", "pwa", "browser"]) {
    requirePattern(quality, new RegExp(`npm --prefix apps/${app} exec playwright install(?: --with-deps)? chromium`), `Quality workflow does not install Playwright for ${app}`)
  }
  forbidPattern(`${candidate}\n${publisher}`, /(?:^|[\s:'"])(?:latest|[^\s:'"]+:latest)(?:$|[\s'"])/m, "Release workflows must never use latest")
  return true
}
