const ALL = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]
const CANDIDATE_RELEASE_SIGNATURE_TERMS = /signature|signing|private[ _-]?key|public[ _-]?key|trust[ _-]?root|release\.lock\.sig|release-public\.pem|release-trust\.json|HOSPITAL_RELEASE_SIGNING_KEY/i
const PUBLISHER_PRIVATE_SIGNING_TERMS = /HOSPITAL_RELEASE_SIGNING_KEY|RELEASE_SIGNING_KEY|SIGNING_PRIVATE|PRIVATE_SIGNING|release-signing-private|sign-release-lock\.sh|pkeyutl[^\n]*-sign|openssl[^\n]*genpkey|BEGIN [A-Z ]*PRIVATE KEY/i

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
  forbidPattern(candidate, CANDIDATE_RELEASE_SIGNATURE_TERMS, "Candidate workflow must remain unsigned and must not reference signatures, release keys or a release trust root")
  forbidPattern(publisher, PUBLISHER_PRIVATE_SIGNING_TERMS, "Publication workflow must never receive or use release private-key material")

  const candidateTrigger = triggerBlock(candidate)
  requirePattern(candidateTrigger, /push:\s*\n\s*tags:\s*\n\s*- "hospital-\*"/, "Candidate workflow must run only for Hospital tags")
  forbidPattern(candidateTrigger, /workflow_dispatch\s*:|workflow_run\s*:/, "Candidate workflow must not expose manual or automatic publication triggers")
  requirePattern(candidate, /cancel-in-progress:\s*false/, "Candidate runs must never cancel one another")
  const metadataSection = candidate.slice(
    candidate.indexOf("\n  metadata:"),
    candidate.indexOf("\n  quality:"),
  )
  requirePattern(
    metadataSection,
    /node scripts\/client-localization-import-gate\.mjs --require-ready/,
    "Candidate metadata must refuse a pending or incomplete client localization import before release work",
  )
  requirePattern(candidate, /\n\s*candidate:\s*\n/, "Tag workflow must produce a candidate")
  forbidPattern(candidate, /environment:\s*hospital-release|contents:\s*write|gh release/, "Candidate workflow must not publish a GitHub Release")
  requirePattern(candidate, /node scripts\/release-inputs\.mjs env release-inputs\.json/, "Candidate build inputs must be committed and digest-pinned")
  forbidPattern(candidate, /HOSPITAL_(?:POSTGRES|CADDY|CURL)_SOURCE_IMAGE/, "Candidate must build and scan the hardened Hospital PostgreSQL, Caddy and curl-worker images")
  requirePattern(candidate, /api api\s+browser browser\s+caddy caddy\s+curl-worker delivery-worker\s+migrate migrate\s+postgres postgres\s+pwa pwa\s+status status\s+tools tools\s+web web/, "Candidate must retain the exact ten image-to-Compose-service mappings")
  for (const input of [
    "NODE_API_BASE_IMAGE",
    "NODE_BROWSER_BASE_IMAGE",
    "NODE_PWA_BUILD_BASE_IMAGE",
    "NODE_STATUS_BASE_IMAGE",
    "NODE_WEB_BASE_IMAGE",
    "NGINX_PWA_BASE_IMAGE",
    "POSTGRES_BASE_IMAGE",
    "CADDY_BUILD_BASE_IMAGE",
    "CADDY_RUNTIME_BASE_IMAGE",
    "CURL_BASE_IMAGE",
    "TRIVY_IMAGE",
  ]) {
    requirePattern(candidate, new RegExp(`build_identity=[\\s\\S]{0,700}\\$${input}`), `Candidate build identity is missing ${input}`)
  }
  requirePattern(candidate, /create-release-handoff\.mjs[\s\S]*publication-request\.tsv/, "Candidate must create the exact manual publication request")
  requirePattern(candidate, /Prove the exact candidate through a verified release transition[\s\S]*HOSPITAL_RELEASE_TEST_ONLY:[\s\S]{0,80}"1"[\s\S]*run-online-release\.sh[\s\S]{0,180}release\.lock\.sha256[\s\S]*sh -c 'set -e; (sudo -E )?sh scripts\/test-install\.sh;/, "Candidate must install the exact locked images through the verified release launcher without masking failures")
  forbidPattern(candidate, /COMPOSE_FILE:\s*compose\.yaml:compose\.release\.yaml[\s\S]{0,200}sh scripts\/test-install\.sh/, "Candidate must not bypass verified transition state for a release-mode install")
  requirePattern(candidate, /printf '%s  %s\\n' "\$lock_sha256" "\$lock_name" > "\$lock\.sha256"[\s\S]*sha256sum --check --strict "\$lock_name\.sha256"/, "Candidate must create and check the canonical release.lock SHA-256 sidecar")
  requirePattern(candidate, /hospital-\$\{\{ needs\.metadata\.outputs\.version \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-candidate/, "Candidate artifact name must bind version, run ID and run attempt")
  requirePattern(candidate, /retention-days:\s*14\s*\n\s*compression-level:\s*0/, "Candidate retention must be bounded without recompressing multi-GB payloads")
  requirePattern(candidate, /candidate-\$GITHUB_SHA-\$GITHUB_RUN_ID-\$build_identity/, "Candidate identity must bind commit, run and build inputs")
  requirePattern(candidate, /verify-prior/, "Existing candidates must match durable prior evidence")
  const discoveryStart = candidate.indexOf("Discover candidates already built by an earlier attempt")
  const buildStart = candidate.indexOf("Build each missing custom candidate exactly once")
  if (discoveryStart < 0 || buildStart <= discoveryStart) throw new Error("Candidate prior-run discovery stage is missing")
  const discoverySection = candidate.slice(discoveryStart, buildStart)
  requirePattern(discoverySection, /verify-prior[\s\S]*verify-portable/, "Prior-run candidates must be checked with durable evidence and portable image identity")
  forbidPattern(discoverySection, /verify-(?:local|ledger-local)/, "Prior-run candidates must never compare same-host Docker IDs")
  const candidateTagClassifications = candidate.match(/tag_state="\$\(node scripts\/ghcr-tag-state\.mjs "\$(?:reference|candidate)" --allow-repository-absent\)"/g) ?? []
  if (candidateTagClassifications.length !== 3) throw new Error("All candidate discovery, resume and push decisions must use authoritative GHCR tag-state classification")
  forbidPattern(candidate, /docker manifest inspect|ghcr-tag-state\.mjs[^\n]*(?:\|\||;)[^\n]*(?:absent|true)/, "Candidate publication must not convert ambiguous registry inspection failures into absence")
  requirePattern(discoverySection, /case "\$tag_state" in[\s\S]*exists\)[\s\S]*hospital-candidates-existing\.txt[\s\S]*absent\)[\s\S]*hospital-candidates-missing\.txt/, "Only authoritative candidate tag absence may trigger a rebuild")
  const pushStart = candidate.indexOf("Push only missing run-specific private candidates")
  const pullStart = candidate.indexOf("Remove local candidates and re-pull exact registry identities")
  if (pushStart < 0 || pullStart <= pushStart) throw new Error("Candidate push stage is missing")
  const pushSection = candidate.slice(pushStart, pullStart)
  requirePattern(pushSection, /case "\$tag_state" in[\s\S]*exists\)[\s\S]*verify-local[\s\S]*absent\)[\s\S]*verify-local[\s\S]*docker push "\$reference"/, "Only authoritative candidate tag absence may permit a push")
  const currentRunLocalChecks = candidate.match(/release-image-evidence\.mjs verify-local/g) ?? []
  if (currentRunLocalChecks.length < 3) throw new Error("Current-run candidates must retain same-host ledger checks before reuse and push")
  forbidPattern(`${candidate}\n${publisher}`, /\.imageId\b/, "Release workflows must not restore the legacy Docker .imageId evidence field")
  forbidPattern(publisher, /\.localDockerId\b|\{\{[^}\n]*\.Id\b[^}\n]*\}\}/, "Publisher must never compare cross-host Docker IDs")
  const candidateLocalDockerIdReads = candidate.match(/\.localDockerId\b/g) ?? []
  if (candidateLocalDockerIdReads.length !== 1) throw new Error("Candidate may read localDockerId only for the same-host scanner deletion guard")
  requirePattern(candidate, /scanner_id="\$\(docker image inspect --format '\{\{\.Id\}\}' "\$TRIVY_IMAGE"\)"[\s\S]{0,260}image\.localDockerId === process\.argv\[1\]/, "Candidate scanner cleanup must use localDockerId only as a same-host deletion guard")
  const candidateDockerIdReads = candidate.match(/\{\{[^}\n]*\.Id\b[^}\n]*\}\}/g) ?? []
  if (candidateDockerIdReads.length !== 2) throw new Error("Candidate Docker .Id reads must be limited to same-host scanner and current-run lock cleanup")
  requirePattern(candidate, /mark-policy-passed/, "Candidates must retain proof that scan policy passed before push")
  requirePattern(candidate, /postgres-source-provenance\.mjs create[\s\S]{0,260}release-inputs\.json \.data\/release-evidence\/postgres-source-provenance/, "Candidate must extract exact PostgreSQL source provenance into security evidence")
  requirePattern(candidate, /postgres-source-provenance\.mjs require-vulnerability-review[\s\S]{0,120}\$HOSPITAL_RELEASE[\s\S]{0,80}release-inputs\.json/, "Candidate must fail closed without an explicit release-specific source-component vulnerability review")
  requirePattern(candidate, /mark-policy-passed[\s\S]{0,220}postgres-source-provenance\/postgres-source-provenance\.json[\s\S]{0,120}candidate-evidence\.tsv/, "Candidate policy evidence must bind exact PostgreSQL source provenance")
  requirePattern(candidate, /id:\s*buildx[\s\S]*docker\/setup-buildx-action@[a-f0-9]{40}/, "Candidate must name the selected Buildx builder")
  requirePattern(candidate, /docker buildx prune --builder "\$\{\{ steps\.buildx\.outputs\.name \}\}" --all --force[\s\S]{0,160}docker buildx rm "\$\{\{ steps\.buildx\.outputs\.name \}\}"/, "Candidate must prune and remove the exact selected Buildx builder after recording image identities")
  requirePattern(candidate, /cache_path="\$\(realpath \.data\/trivy-cache\)"[\s\S]{0,300}test "\$cache_path" = "\$GITHUB_WORKSPACE\/\.data\/trivy-cache"[\s\S]{0,300}rm -rf "\$cache_path"[\s\S]{0,240}docker image rm --force "\$scanner_id"[\s\S]{0,160}docker image prune --force/, "Candidate must safely delete Trivy cache and only its selected scanner image after evidence upload")
  requirePattern(candidate, /create-image-lock\.mjs[\s\S]{0,500}verify-lock[\s\S]{0,300}verify-loaded-lock[\s\S]{0,400}image-lock\.mjs refs[\s\S]{0,240}docker image inspect --format '\{\{\.Id\}\}' "\$reference"[\s\S]{0,180}hospital-locked-local-ids\.txt/, "Candidate must derive cleanup IDs locally from the current-run verified lock")
  requirePattern(candidate, /mapfile -t locked_ids < "\$RUNNER_TEMP\/hospital-locked-local-ids\.txt"[\s\S]*if \[ "\$image_id" = "\$locked_id" \][\s\S]*docker image rm --force "\$image_id"[\s\S]*verify-loaded-lock/, "Candidate image cleanup must preserve and re-verify every current-run locked image")
  forbidPattern(candidate, /docker (?:system prune|image prune --all)(?:\s|$)/, "Candidate must never broadly prune locked release images")
  const imageNames = ALL.join(",")
  requirePattern(candidate, new RegExp(
    `release-image-evidence\\.mjs verify-scans[\\s\\S]{0,220}built-image-ledger\\.json[\\s\\S]{0,180}vulnerabilities/\\{${imageNames}\\}\\.json[\\s\\S]{0,180}sboms/\\{${imageNames}\\}\\.cdx\\.json`,
  ), "Candidate scan proof must bind exactly ten vulnerability reports and ten CycloneDX SBOMs to the same-host ledger")
  if (/HOSPITAL_(?:IMAGE_TAG|CANDIDATE_TAG):[^\n]*run_attempt/i.test(candidate)) throw new Error("Candidate identity must be stable across rerun attempts")
  ordered(candidate, [
    "Require approved digest-pinned build, runtime and scanner images",
    "Discover candidates already built by an earlier attempt",
    "Build each missing custom candidate exactly once",
    "Prove backup and restore with the exact candidate PostgreSQL image",
    "Prove legacy-volume compatibility with the exact candidate PostgreSQL image",
    "Record all ten pre-push image identities",
    "Extract and verify source-built PostgreSQL provenance",
    "Discard selected Buildx cache and builder after recording candidate identities",
    "Scan all ten candidate images and create SBOM evidence",
    "Upload scan evidence even when policy blocks the release",
    "Delete scanner cache and its non-release image",
    "Establish resumable candidate state",
    "Push only missing run-specific private candidates",
    "Remove local candidates and re-pull exact registry identities",
    "Test migrations with the exact re-pulled candidate image",
    "Reclaim only images outside the verified release lock",
    "Build deployment kit and split offline bundle from tested identities",
    "Create canonical JSON manifest and host-verifiable release lock",
    "Create the canonical lock checksum and publication request",
    "Prove the exact candidate through a verified release transition",
    "Upload the release candidate for manual publication",
  ], "Candidate workflow")
  for (const name of ALL) requirePattern(candidate, new RegExp(`\\n\\s*scan ${name.replace("-", "\\-")} `), `Candidate workflow does not scan ${name}`)

  const publisherTrigger = triggerBlock(publisher)
  requirePattern(publisherTrigger, /workflow_dispatch\s*:/, "Publication must be explicitly dispatched")
  forbidPattern(publisherTrigger, /\npush\s*:|workflow_run\s*:|schedule\s*:/, "Publication must never start automatically")
  for (const input of ["candidate_run_id", "candidate_run_attempt", "version", "expected_lock_sha256", "release_signature_base64", "expected_signature_sha256", "confirm_publication", "confirm_immutable_releases"]) {
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
  const writeBeforeMutation = writeSection.slice(0, mutationMarker)
  forbidPattern(writeBeforeMutation, /docker push|gh release (?:create|upload|edit)|gh api[^\n]*(?:--method|-X)\s*(?:POST|PUT|PATCH|DELETE)/i, "Write-capable job must finish independent verification before its first external mutation")
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
  const signatureMaterializations = publisher.match(/materialize-release-signature\.mjs/g) ?? []
  if (signatureMaterializations.length !== 2) throw new Error("Both publication jobs must independently decode and verify the reviewed release signature")
  const signatureDigestChecks = publisher.match(/sha256sum "\$lock\.sig"/g) ?? []
  if (signatureDigestChecks.length !== 2) throw new Error("Both publication jobs must independently bind the raw signature SHA-256")
  const signingKeyContinuityChecks = publisher.match(/git diff --exit-code "\$(?:COMMIT|candidate_commit)" "\$GITHUB_SHA" -- infra\/release-signing\/release-signing-public\.pem/g) ?? []
  if (signingKeyContinuityChecks.length !== 2) throw new Error("Both publication jobs must bind the candidate and publisher to the same reviewed release public key")
  const candidateCommitTagChecks = publisher.match(/test "\$ref_sha" = "\$candidate_commit"/g) ?? []
  if (candidateCommitTagChecks.length < 3) throw new Error("Both jobs must bind the Hospital tag to the candidate commit")
  requirePattern(verifySection, /docker\/login-action@[a-f0-9]{40}[\s\S]*registry:\s*ghcr\.io/, "Read-only verification must authenticate to private GHCR candidates")
  requirePattern(verifySection, /verify-registry-image-lock\.mjs "\$image_lock" "\$VERSION" --immutable-only/, "Read-only verification must prove all ten portable immutable registry identities")
  requirePattern(writeBeforeMutation, /verify-registry-image-lock\.mjs "\$image_lock" "\$VERSION" --immutable-only/, "Write job must independently prove portable immutable registry identities before mutation")
  const immutableRegistryProofs = publisher.match(/verify-registry-image-lock\.mjs "\$image_lock" "\$VERSION" --immutable-only/g) ?? []
  if (immutableRegistryProofs.length !== 2) throw new Error("Publisher must perform exactly one all-image immutable registry proof in each job before mutation")
  requirePattern(verifySection, /image-lock\.mjs refs "\$image_lock" "\$VERSION" > "\$RUNNER_TEMP\/release-images\.tsv"[\s\S]{0,180}wc -l < "\$RUNNER_TEMP\/release-images\.tsv"[\s\S]{0,80}= 10/, "Publisher installation proof must consume all ten portable lock references")
  requirePattern(publisher, /Prove integrity-verified online and registry-independent offline installation/, "Publisher must run both integrity-verified installation proofs")
  requirePattern(publisher, /run-online-release\.sh[\s\S]{0,180}release\.lock\.sha256[\s\S]*load-offline\.sh[\s\S]{0,180}release\.lock\.sha256/, "Installation proofs must use the verified runtime CLI")
  const installationProofStart = verifySection.indexOf("Prove integrity-verified online and registry-independent offline installation")
  const offlineProofStart = verifySection.indexOf('bootstrap="$RUNNER_TEMP/hospital-offline/bootstrap"', installationProofStart)
  if (installationProofStart < 0 || offlineProofStart <= installationProofStart) {
    throw new Error("Publisher installation proof must keep distinct online and offline paths")
  }
  const onlineInstallationProof = verifySection.slice(installationProofStart, offlineProofStart)
  const offlineInstallationProof = verifySection.slice(offlineProofStart)
  requirePattern(onlineInstallationProof, /HOSPITAL_CREDENTIAL_TEST_ONLY:\s*"1"/, "Online publication proof must isolate credential writes in its test home")
  requirePattern(onlineInstallationProof, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/, "Online publication proof must use only the job's packages:read workflow token for GHCR")
  requirePattern(onlineInstallationProof, /for script in[^\n]*provision-update-credentials\.sh[^\n]*; do/, "Online publication proof must carry the reviewed GHCR credential provisioner")
  requirePattern(onlineInstallationProof, /printf '%s\\n%s\\n' "\$GITHUB_ACTOR" "\$GH_TOKEN"[\s\S]{0,120}provision-update-credentials\.sh" ghcr[\s\S]*run-online-release\.sh/, "Online publication proof must provision GHCR before running the connected release path")
  forbidPattern(offlineInstallationProof, /HOSPITAL_CREDENTIAL_TEST_ONLY|GH_TOKEN|provision-update-credentials\.sh/, "Offline publication proof must remain independent of registry credentials")
  const pinnedProofKeys = publisher.match(/cp infra\/release-signing\/release-signing-public\.pem "\$home\/secrets\/release-signing-public\.pem"/g) ?? []
  if (pinnedProofKeys.length !== 2) throw new Error("Online and offline installation proofs must require the reviewed release signature through a pinned public key")
  const signatureVerifierCopies = publisher.match(/verify-release-signature\.sh verify-release\.sh/g) ?? []
  if (signatureVerifierCopies.length !== 2) throw new Error("Signed installation proofs must carry the independent host signature verifier")
  const failClosedInstallProofs = publisher.match(/sh -c 'set -e; sudo -E sh scripts\/test-install\.sh;/g) ?? []
  if (failClosedInstallProofs.length !== 2) throw new Error("Both publication installation proofs must run the appliance test as root and propagate failures")
  requirePattern(publisher, /docker builder prune --all --force[\s\S]*docker image prune --all --force/, "Offline proof must remove registry images and build cache")
  forbidPattern(publisher, /actions\/upload-artifact|verified-release-assets/, "Publication must not duplicate the multi-GB candidate as a second Actions artifact")
  requirePattern(writeSection, /verify-release-candidate\.mjs "\$VERSION" release-assets candidate-assets "\$candidate_commit"[\s\S]*rm "release-assets\/\$prefix-images\.json" "release-assets\/\$prefix-publication-request\.tsv"[\s\S]*verify-release-candidate\.mjs "\$VERSION" release-assets final-assets "\$candidate_commit"/, "Write job must independently reduce the exact candidate to the final asset set")
  forbidPattern(writeSection, /(?:^|\n)\s*(?:bash|sh|node)\s+["']?release-assets\//, "Write job must never execute code extracted from the candidate artifact")
  requirePattern(publisher, /while IFS="\$\(printf '\\t'\)" read -r reference immutable config_digest extra; do[\s\S]{0,320}! docker image inspect "\$reference"[\s\S]{0,180}! docker image inspect "\$immutable"[\s\S]{0,120}done < "\$RUNNER_TEMP\/release-images\.tsv"/, "Offline proof must remove both mutable and immutable references obtained from the portable lock")
  requirePattern(writeSection, /wc -l < "\$RUNNER_TEMP\/custom-images\.tsv"[\s\S]{0,120}= 10/, "Publisher must promote all ten Hospital GHCR images")
  const releaseMarker = writeSection.indexOf("Create exact immutable GitHub Release")
  if (releaseMarker <= mutationMarker) throw new Error("Publication release stage is missing after promotion")
  const promotionSection = writeSection.slice(mutationMarker, releaseMarker)
  requirePattern(promotionSection, /const immutable = `\$\{image\.reference\.slice\(0, image\.reference\.lastIndexOf\(":"\)\)\}@\$\{image\.digest\}`/, "Promotion source must be the locked top-level registry digest")
  requirePattern(promotionSection, /while IFS="\$\(printf '\\t'\)" read -r image_name immutable reference; do[\s\S]{0,220}docker pull --platform linux\/amd64 "\$immutable"/, "Promotion must pull the locked linux/amd64 immutable descriptor")
  requirePattern(promotionSection, /GH_TOKEN:\s*\$\{\{ github\.token \}\}/, "Promotion must authenticate its authoritative GHCR tag-state request with the scoped workflow token")
  requirePattern(promotionSection, /tag_state="\$\(node scripts\/ghcr-tag-state\.mjs "\$reference"\)"\s+case "\$tag_state" in/, "Promotion must fail closed through the authoritative GHCR tag-state classifier")
  requirePattern(promotionSection, /exists\)\s+node scripts\/verify-registry-image-lock\.mjs "\$image_lock" "\$VERSION" "\$image_name"\s+;;/, "An existing version tag must match the locked portable identity")
  requirePattern(promotionSection, /absent\)\s+docker buildx imagetools create --prefer-index=false --tag "\$reference" "\$immutable"\s+;;/, "Only authoritative tag absence may permit exact digest-source promotion")
  requirePattern(promotionSection, /\*\)\s+echo "GHCR classifier returned an impossible state for \$reference" >&2\s+exit 1\s+;;\s+esac/, "Unknown GHCR tag state must stop publication before mutation")
  requirePattern(promotionSection, /esac\s+node scripts\/verify-registry-image-lock\.mjs "\$image_lock" "\$VERSION" "\$image_name"\s+done < "\$RUNNER_TEMP\/custom-images\.tsv"\s+node scripts\/verify-registry-image-lock\.mjs "\$image_lock" "\$VERSION"/, "Publisher must immediately verify each promoted tag and then all ten portable registry identities")
  forbidPattern(promotionSection, /docker manifest inspect|ghcr-tag-state\.mjs[^\n]*(?:\|\||;)[^\n]*(?:absent|true)/, "Promotion must not convert ambiguous, transient or authorization inspection failures into tag absence")
  forbidPattern(promotionSection, /docker (?:tag|push)\b|imagetools create[^\n]*(?:--append|"\$reference"\s+"\$reference")/, "Publisher promotion must not retag, push, append to, or source from a mutable tag")
  const promotionCommands = promotionSection.match(/^\s*docker buildx imagetools create[^\n]*$/gm) ?? []
  if (promotionCommands.length !== 1 || promotionCommands[0].trim() !== 'docker buildx imagetools create --prefer-index=false --tag "$reference" "$immutable"') {
    throw new Error("Publisher promotion must have exactly one safe imagetools command sourced from the locked immutable digest")
  }
  requirePattern(writeSection, /gh release edit "\$tag" --draft=false[\s\S]*gh release view "\$tag" --json isImmutable --jq '\.isImmutable == true'/, "Publisher must verify post-publication immutability through the release API")
  const finalTagChecks = writeSection.match(/assert_tag_commit/g) ?? []
  if (finalTagChecks.length < 3) throw new Error("Publisher must define and repeat the exact tag-to-commit check")
  requirePattern(publisher, /Exact immutable release already exists; publication is an idempotent no-op/, "Publisher must accept only an exact immutable replay")
  requirePattern(writeSection, /release_marker="LOSPOR-HOSPITAL-PUBLICATION-V1 version=\$VERSION commit=\$COMMIT candidate=\$RUN_ID\/\$RUN_ATTEMPT lock-sha256=\$EXPECTED_LOCK_SHA256 signature-sha256=\$EXPECTED_SIGNATURE_SHA256"/, "Resumable draft identity must bind version, commit, candidate run, release-lock digest and signature digest")
  requirePattern(writeSection, /validate_release_metadata\(\)[\s\S]*release\.isPrerelease !== false[\s\S]*release\.tagName !== tag[\s\S]*release\.name !== title[\s\S]*release\.body !== notes[\s\S]*gh release view "\$tag" --json assets,body,isDraft,isImmutable,isPrerelease,name,tagName,targetCommitish[\s\S]*validate_release_metadata "\$RUNNER_TEMP\/existing-release\.json"[\s\S]*if \[ "\$\(node -p "require\('\$RUNNER_TEMP\/existing-release\.json'\)\.isImmutable"\)" = true \]/, "Both immutable replay and draft resume must require exact run-bound metadata before branching")
  requirePattern(writeSection, /if \[ "\$\(node -p "require\('\$RUNNER_TEMP\/existing-release\.json'\)\.isImmutable"\)" = true \][\s\S]*Exact immutable release already exists; publication is an idempotent no-op\.[\s\S]*release\.isDraft !== true \|\| release\.isImmutable === true/, "Publisher may resume only an exact draft and must reject every other mutable release")
  requirePattern(writeSection, /node scripts\/inspect-release-assets\.mjs "\$RUNNER_TEMP\/existing-release-rest\.json"[\s\S]*--allow-starter[\s\S]*node scripts\/inspect-release-assets\.mjs "\$RUNNER_TEMP\/existing-release-rest\.json"/, "Release asset inspection must distinguish exact empty draft starters from completed uploads")
  requirePattern(writeSection, /validate_release_metadata "\$RUNNER_TEMP\/existing-release\.json"[\s\S]*if \[ "\$\(node -p[^\n]*isImmutable[^\n]*\)" = true \]; then[\s\S]*verify_release_assets "\$RUNNER_TEMP\/existing-assets" false[\s\S]*cmp "\$RUNNER_TEMP\/local-files" "\$RUNNER_TEMP\/remote-files"[\s\S]*exit 0[\s\S]*release\.isDraft !== true \|\| release\.isImmutable === true[\s\S]*verify_release_assets "\$RUNNER_TEMP\/existing-assets" true[\s\S]*gh api --method DELETE "repos\/\$GITHUB_REPOSITORY\/releases\/assets\/\$asset_id"[\s\S]*resume_draft=true/, "Immutable replay must reject incomplete assets and draft resume may delete only validated empty starter asset IDs")
  requirePattern(writeSection, /resume_draft=true[\s\S]*if \[ "\$resume_draft" = false \]; then[\s\S]*gh release create "\$tag" --verify-tag --target "\$COMMIT" --draft/, "Existing draft assets must be a byte-identical allowlisted subset before guarded resume")
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

  requirePattern(candidate, /POSTGRES_IMAGE="ghcr\.io\/kaloyandjunow-prog\/lospor-hospital-postgres:\$HOSPITAL_IMAGE_TAG"[\s\S]{0,80}sh scripts\/test-backup-restore\.sh/, "Candidate must restore a real backup with the exact custom PostgreSQL candidate")
  requirePattern(candidate, /postgres-cross-base-upgrade\.test\.sh[\s\S]{0,100}"ghcr\.io\/kaloyandjunow-prog\/lospor-hospital-postgres:\$HOSPITAL_IMAGE_TAG"/, "Candidate must open the legacy PostgreSQL volume with the exact custom candidate before provenance and push")
  requirePattern(candidate, /POSTGRES_IMAGE="\$HOSPITAL_IMAGE_REGISTRY\/lospor-hospital-postgres:\$HOSPITAL_RELEASE"[\s\S]{0,80}sh scripts\/test-migrator-image\.sh/, "Migration test must use the final locked custom PostgreSQL candidate")
  requirePattern(quality, /POSTGRES_IMAGE=lospor-hospital-postgres:source[\s\S]{0,100}sh scripts\/test-backup-restore\.sh/, "Quality workflow must run the backup/restore drill with the hardened PostgreSQL image")
  requirePattern(quality, /npm run test:manual-release/, "Quality workflow must gate the manual release contracts")
  requirePattern(quality, /npm run test:update-pipeline/, "Quality workflow must gate the complete update pipeline contracts")
  requirePattern(quality, /npm run test:operator-localization/, "Quality workflow must gate Bulgarian and English operator surfaces")
  requirePattern(quality, /npm run test:central-full-story/, "Quality workflow must gate the Hospital-to-Central synthetic full story")
  for (const command of ["e2e:web-full", "e2e:pwa-full", "e2e:browser-full"]) {
    requirePattern(quality, new RegExp(`npm run ${command.replace(":", "\\:")}`), `Quality workflow does not gate ${command}`)
  }
  for (const app of ["web", "pwa", "browser"]) {
    requirePattern(quality, new RegExp(`npm --prefix apps/${app} exec playwright install(?: --with-deps)? chromium`), `Quality workflow does not install Playwright for ${app}`)
  }
  forbidPattern(`${candidate}\n${publisher}`, /(?:^|[\s:'"])(?:latest|[^\s:'"]+:latest)(?:$|[\s'"])/m, "Release workflows must never use latest")
  return true
}
