const ALL = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

function ordered(text, markers) {
  let cursor = -1
  for (const marker of markers) {
    const next = text.indexOf(marker)
    if (next < 0 || next <= cursor) throw new Error(`Release workflow stage is missing or out of order: ${marker}`)
    cursor = next
  }
}

function assertPinnedExternalActions(workflow, label) {
  const lines = workflow.split("\n")
  let actionCount = 0
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.+))?\s*$/)
    if (!match) continue
    const reference = match[1]
    if (reference.startsWith("./")) continue
    actionCount += 1
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/.test(reference)) {
      throw new Error(`${label} external action must use a full commit SHA on line ${index + 1}: ${reference}`)
    }
    if (!/^v[0-9]+\.[0-9]+\.[0-9]+(?:\s|$)/.test(match[2] ?? "")) {
      throw new Error(`${label} pinned action must retain a readable version comment on line ${index + 1}: ${reference}`)
    }
  }
  if (actionCount === 0) throw new Error(`${label} contains no external actions to verify`)
}

export function assertReleaseWorkflowContract(release, quality) {
  assertPinnedExternalActions(release, "Release workflow")
  assertPinnedExternalActions(quality, "Quality workflow")
  const trigger = release.slice(0, release.indexOf("permissions:"))
  if (/workflow_dispatch\s*:/.test(trigger)) {
    throw new Error("Publishing workflow must not expose a misleading manual dispatch")
  }
  requirePattern(release, /cancel-in-progress:\s*false/, "Release runs must never cancel one another")
  requirePattern(release, /environment:\s*hospital-release/, "Publication must use the protected release environment")
  requirePattern(release, /candidate-\$GITHUB_SHA-\$GITHUB_RUN_ID-\$build_identity/, "Candidate identity must bind commit, run and build inputs")
  requirePattern(release, /verify-prior/, "Existing candidates must match durable prior evidence")
  requirePattern(release, /mark-policy-passed/, "Candidates must retain proof that scan policy passed before push")
  if (/HOSPITAL_(?:IMAGE_TAG|CANDIDATE_TAG):[^\n]*run_attempt/i.test(release)) {
    throw new Error("Candidate identity must be stable across rerun attempts")
  }
  requirePattern(release, /docker builder prune --all --force/, "Offline proof must remove build cache")
  requirePattern(release, /docker image rm --force \$refs \$candidates/, "Offline proof must remove release and candidate references")
  requirePattern(release, /gh release upload "\$tag" dist\/\* --clobber/, "Draft release assets must support an exact retry")
  requirePattern(release, /gh release download "\$tag" --dir/, "Draft release assets must be downloaded for byte verification")
  requirePattern(release, /HOSPITAL_RELEASE_SIGNING_KEY_B64/, "Release signing key must be supplied externally")
  requirePattern(release, /HOSPITAL_RELEASE_TRIVY_IMAGE/, "Scanner image must be digest-configured")
  requirePattern(
    release,
    /POSTGRES_IMAGE="\$HOSPITAL_POSTGRES_SOURCE_IMAGE" sh scripts\/test-backup-restore\.sh/,
    "Release must restore a real backup with the approved PostgreSQL image",
  )
  requirePattern(
    quality,
    /run:\s*sh scripts\/test-backup-restore\.sh/,
    "Quality workflow must run the disposable backup/restore drill",
  )
  if (/(?:^|[\s:'"])(?:latest|[^\s:'"]+:latest)(?:$|[\s'"])/m.test(release)) throw new Error("Release workflow must never use latest")

  const signedProofsEnd = release.indexOf("Promote tested custom identities without rebuilding")
  if (signedProofsEnd < 0) throw new Error("Release workflow is missing the signed installation proofs")
  const signedProofs = release.slice(0, signedProofsEnd)
  if (/rm\s+(?:-[^\n]*\s+)?(?:[^\n]*\s)?(?:\.data\/release-keys\/public\.pem|\.data\/release-keys(?:\s|$))/m.test(signedProofs)) {
    throw new Error("Trusted public key must remain available through both signed installation proofs")
  }

  ordered(release, [
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
    "Sign only inside the approval-protected release environment",
    "Prove the signed deployment kit drives an online installation",
    "Prove registry-independent offline installation",
    "Promote tested custom identities without rebuilding",
    "Create, verify, then publish the GitHub Release",
  ])

  for (const name of ALL) {
    requirePattern(release, new RegExp(`\\n\\s*scan ${name.replace("-", "\\-")} `), `Release does not scan ${name}`)
  }
  requirePattern(release, /lospor-hospital-\$service:\$HOSPITAL_IMAGE_TAG/, "Candidate discovery/push does not use the run-specific tag")
  for (const command of ["e2e:clinical-golden", "e2e:pwa-offline", "e2e:browser-authenticated"]) {
    requirePattern(quality, new RegExp(`npm run ${command.replace(":", "\\:")}`), `Quality workflow does not gate ${command}`)
  }
  for (const app of ["web", "pwa", "browser"]) {
    requirePattern(
      quality,
      new RegExp(`npm --prefix apps/${app} exec playwright install(?: --with-deps)? chromium`),
      `Quality workflow does not install the Playwright browser revision required by ${app}`,
    )
  }
  return true
}
