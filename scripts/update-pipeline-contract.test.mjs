import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "..")
const source = name => readFile(resolve(root, name), "utf8")

test("Status can express intent but cannot choose any trusted release identity", async () => {
  const requests = await source("apps/status/src/update-requests.ts")
  assert.match(requests, /LOSPOR-HOSPITAL-UPDATE-REQUEST-V2/)
  assert.match(requests, /export type ApplyRequest = \{\s*requestId: string\s*targetVersion: string\s*window: "scheduled" \| "override"\s*\}/)
  const bodies = [...requests.matchAll(/const body = \[([\s\S]*?)\n  \]\.join\("\\t"\)/g)]
    .map(match => match[1])
    .filter(body => body.includes('"LOSPOR-HOSPITAL-UPDATE-REQUEST-V2"'))
  assert.equal(bodies.length, 2)
  for (const body of bodies) {
    for (const forbidden of ["targetPath", "releaseRoot", "targetLockSha256", "expectedInstalledVersion", "command", "bypass"]) {
      assert.doesNotMatch(body, new RegExp(forbidden), `${forbidden} must not enter the durable request`)
    }
  }
})

test("the host agent calls only the trusted prepare and exact prepared apply entrypoints", async () => {
  const agent = await source("scripts/update-agent-loop.sh")
  assert.match(agent, /scripts\/prepare-verified-release\.sh/)
  assert.match(agent, /scripts\/apply-prepared-release\.sh/)
  assert.doesNotMatch(agent, /scripts\/update\.sh/)
  assert.match(agent, /mv "\$pending" "\$consumed"/)
  assert.match(agent, /UPDATE_AMBIGUOUS_APPLY/)
  assert.match(agent, /HOSPITAL_UPDATE_TIMEZONE/)
  assert.match(agent, /flock -w "\$poll" 9/)
  assert.match(agent, /flock -w "\$poll" 9; then[\s\S]*reconcile_startup[\s\S]*flock -u 9/)
})

test("prepare authenticates immutable publication evidence before download or pull", async () => {
  const prepare = await source("scripts/prepare-verified-release.sh")
  const capacity = prepare.indexOf('update-capacity.sh" prepare')
  const firstDownload = prepare.indexOf('download_asset "$prefix-')
  const firstPull = prepare.indexOf('run-online-release.sh" --fetch-only')
  const descriptorWrite = prepare.indexOf("LOSPOR-HOSPITAL-PREPARED-RELEASE-V2")
  assert.ok(capacity >= 0 && firstDownload > capacity && firstPull > capacity)
  assert.ok(descriptorWrite > firstPull, "descriptor must be committed only after exact images verify")
  assert.match(prepare, /HOSPITAL_REQUIRE_RELEASE_SIGNATURE=1/)
  assert.match(prepare, /update-release-metadata\.py" parse-release/)
  assert.match(prepare, /validate-redirect/)
  assert.match(prepare, /release_compatibility_assert_version/)
  assert.doesNotMatch(prepare, /--location-trusted|docker\s+(?:image|system)\s+prune/)
})

test("apply binds activation to the one root-owned descriptor", async () => {
  const apply = await source("scripts/apply-prepared-release.sh")
  assert.match(apply, /update_descriptor_for_version "\$version"/)
  assert.match(apply, /UPDATE_PREPARED_FROM_DIFFERENT_RELEASE/)
  assert.match(apply, /verify-loaded-release-images\.sh" "\$descriptor_lock"/)
  assert.match(apply, /activate-verified-release\.sh"[\s\S]*"\$descriptor_lock" "\$descriptor_checksum" "\$descriptor_root"/)
  assert.doesNotMatch(apply, /scripts\/update\.sh/)
})

test("download and database mutation share one persistent flock inode with backup", async () => {
  const library = await source("scripts/update-pipeline-lib.sh")
  const prepare = await source("scripts/prepare-verified-release.sh")
  const update = await source("scripts/update.sh")
  assert.match(library, /\.data\/io-mutation\.lock/)
  assert.match(library, /flock -n 8/)
  assert.match(library, /UPDATE_MAINTENANCE_BUSY/)
  assert.match(library, /UPDATE_MAINTENANCE_LOCK_INVALID/)
  assert.doesNotMatch(library, /mkdir "\$update_io_lock"|rmdir "\$update_io_lock"|rm -f "\$update_io_lock"/)
  assert.match(prepare, /update_io_lock_acquire prepare/)
  assert.match(update, /update_io_lock_acquire database-update/)
  assert.doesNotMatch(update, /mkdir "\$mutation_lock"|rmdir "\$mutation_lock"/)
})

test("requests and state survive rename and power-loss boundaries", async () => {
  const requests = await source("apps/status/src/update-requests.ts")
  const library = await source("scripts/update-pipeline-lib.sh")
  const agent = await source("scripts/update-agent-loop.sh")
  const installedState = await source("scripts/installed-release-state.sh")
  const online = await source("scripts/run-online-release.sh")
  assert.match(requests, /await handle\.sync\(\)/)
  assert.match(requests, /await syncDirectory\(requestsDir\)/)
  assert.match(library, /update_durable_replace\(\)/)
  assert.match(library, /sync "\$sync_path"/)
  assert.match(library, /update_sync_path "\$update_journal"/)
  assert.match(agent, /link_attempt.*10[\s\S]*sleep 0\.05/)
  assert.match(installedState, /release_state_sync "\$state_path"/)
  assert.match(installedState, /release_state_sync "\$state_directory"/)
  assert.match(online, /trap cleanup_fetch_status EXIT HUP INT TERM/)
  assert.match(online, /update_durable_replace "\$temporary_status" "\$status_path"/)
})

test("release supply is anonymous: no hospital credential is read, stored or sent", async () => {
  const prepare = await source("scripts/prepare-verified-release.sh")
  const online = await source("scripts/run-online-release.sh")
  const check = await source("scripts/check-for-update.sh")
  const readiness = await source("scripts/readiness-check.sh")
  const probe = await source("scripts/host-observability-probe.sh")
  const guided = await source("scripts/install-guided.sh")
  await assert.rejects(source("scripts/provision-update-credentials.sh"))
  for (const consumer of [prepare, online, check, readiness, probe, guided]) {
    assert.doesNotMatch(consumer, /secrets\/registry|update_credential_read|provision-update-credentials/)
    assert.doesNotMatch(consumer, /docker login|--password-stdin|user = "%s:%s"/)
  }
  assert.doesNotMatch(prepare, /Authorization: Bearer/)
  assert.match(online, /DOCKER_CONFIG="\$temporary_directory\/docker-config"/)
  // The registry's own short-lived pull token is still used for listing tags.
  assert.match(check, /--config "\$bearer_auth_config"/)
})

// The compatibility row is written by hand and copied forward, and nothing
// read schema_max back against the migrations actually in the release. A row
// carried from the previous version keeps that version's schema_max, so the
// release declares a schema it does not ship -- and the declaration is what
// the activation, the dossier and every rollback decision are made from.
//
// Agreed for 1.2.4 and never built. 1.4.3 is what it costs: its row was
// copied from 1.4.2 with only the version changed, and while schema_max
// happened to still be right, the rollback policy beside it was inherited
// unexamined and sent a site into an emergency database restore to recover
// from a file-permissions bug in a release that migrates nothing.
test("schema_max names the newest migration this release actually ships", async () => {
  const row = (await source("release-compatibility.tsv")).trim().split("	")
  const declared = row[3]
  const migrations = (await readdir(resolve(root, "apps/api/prisma/migrations"), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
  const newest = migrations[migrations.length - 1]
  assert.equal(declared, newest,
    `release-compatibility.tsv declares schema_max ${declared}, but the newest migration in this release is ${newest}. ` +
    "A row copied forward keeps the previous release's schema, which every rollback decision is then made from.")
})

// backup-required is the unproven claim, and it is the expensive one.
//
// verify-rollback-compatibility.sh returns 20 for it immediately and asks for
// nothing; service-compatible has to ship a digest-matched proof. So the
// declaration that costs a site an emergency database restore to recover from
// any failed activation is the one nobody has to justify, and the cheap way to
// produce a release is to copy the row forward with the version changed.
//
// 1.4.3 is what that costs. It migrates nothing, its row said backup-required
// because 1.4.2's did, and when its activation failed on a file-permissions
// bug both non-destructive recoveries refused: resume-rollback on the policy,
// verify-and-clear for want of a restore that had not happened. The only
// supported exit was restoring the database.
//
// This does not relax the runtime rule -- an authenticated declaration stays
// final at the moment of failure, which is the one place it must not be
// argued with. It makes the declaration a decision somebody recorded.
test("a backup-required release says why", async () => {
  const row = (await source("release-compatibility.tsv")).trim().split("	")
  const policy = row[4]
  if (policy !== "backup-required") return

  const stated = JSON.parse(await source("release-rollback-justification.json"))
  const version = row[1]
  assert.equal(stated.release, version,
    `release-rollback-justification.json is for ${stated.release}, but this release is ${version}. ` +
    "A justification carried forward unchanged is the inheritance this check exists to stop.")
  assert.equal(stated.policy, policy)
  assert.ok(typeof stated.justification === "string" && stated.justification.trim().length >= 80,
    "backup-required needs a stated reason, not a placeholder: it is what makes a site restore a database to recover.")
})

test("rollback compatibility is a release gate, not an optimistic runtime guess", async () => {
  const policy = await source("release-compatibility.tsv")
  const activation = await source("scripts/activate-verified-release.sh")
  const verifier = await source("scripts/verify-rollback-compatibility.sh")
  assert.match(policy, /\tbackup-required\t-\t0\s*$/)
  assert.match(activation, /verify-rollback-compatibility\.sh/)
  assert.match(activation, /BACKUP_RECOVERY_REQUIRED/)
  assert.match(verifier, /ROLLBACK_REQUIRES_VERIFIED_BACKUP/)
  assert.match(verifier, /rollback-compatibility-evidence\.py/)
})

test("a same-version recovery reaches the pull/load path instead of exiting past it", async () => {
  // Both launchers used to verify the installed release's images under
  // set -eu with nothing catching a failure, so a pruned or damaged image
  // set took the whole script down before it ever reached the pull loop
  // (online) or docker load (offline) below it -- reachable code, just not
  // from this branch. The fix is a fall-through: the verify failure sets
  // same_version_recovery and the branch does NOT exit, so control reaches
  // the exact same acquisition code every fresh install/update already
  // uses, then a dedicated block below it finishes the reconcile that
  // branch would otherwise have done directly.
  for (const [name, acquireMarker] of [
    ["scripts/run-online-release.sh", 'docker pull --platform "$platform" "$immutable"'],
    ["scripts/load-offline.sh", "stream_parts | gzip -dc | docker load"],
  ]) {
    const script = await source(name)
    assert.match(script, /^same_version_recovery=0$/m, `${name}: missing the recovery flag`)
    const verifyFailureBranch = script.indexOf("images_verified\" -ne 0")
    const exitOnSuccessOnly = script.indexOf("exit 0", verifyFailureBranch)
    const esacIndex = script.indexOf("\nesac", verifyFailureBranch)
    assert.ok(verifyFailureBranch >= 0, `${name}: no images_verified branch`)
    // The only "exit 0" between the failure check and esac belongs to the
    // *else* (images were fine) arm, which sits before esac; the failure
    // arm itself must reach esac without exiting.
    assert.ok(exitOnSuccessOnly >= 0 && exitOnSuccessOnly < esacIndex,
      `${name}: expected exactly one exit 0 (the healthy-images arm) before esac`)
    const acquireIndex = script.indexOf(acquireMarker)
    assert.ok(acquireIndex > esacIndex, `${name}: acquisition code must sit after the case, reachable by fall-through`)
    const recoveryFinish = script.indexOf('same_version_recovery" -eq 1', acquireIndex)
    assert.ok(recoveryFinish > acquireIndex, `${name}: no post-acquisition recovery finish`)
    assert.ok(
      script.indexOf("release_state_start_installed_services", recoveryFinish) > recoveryFinish,
      `${name}: recovery finish must still reconcile services, the same as a healthy same-version pass`,
    )
  }
})

test("agent installation and recovery use the canonical appliance boundary", async () => {
  const unit = await source("infra/systemd/lospor-update-agent.service")
  const installer = await source("scripts/install-update-agent.sh")
  const recovery = await source("scripts/recover-release-activation.sh")
  assert.match(unit, /\/opt\/lospor-hospital\/current\/scripts\/update-agent-loop\.sh/)
  assert.doesNotMatch(unit, /\/opt\/lospor\/current/)
  assert.match(installer, /systemd-analyze verify/)
  assert.match(installer, /enable --now lospor-update-agent\.service/)
  assert.match(recovery, /inspect\|resume-rollback\|verify-and-clear/)
  assert.match(recovery, /process_active/)
  assert.match(recovery, /--confirm-clear/)
  assert.doesNotMatch(recovery, /rm\s+-rf\s+[^\n]*release-activation/)
})

test("the first-install bootstrap trusts exactly the repository's release signing key", async () => {
  const bootstrap = await source("scripts/losporctl-install.sh")
  const repositoryKey = (await source("infra/release-signing/release-signing-public.pem")).replace(/\r/g, "").trim()
  const embedded = bootstrap.match(/LOSPOR_RELEASE_SIGNING_PUBLIC_KEY='([^']+)'/)
  assert.ok(embedded, "the bootstrap must carry its signing key inline")
  assert.equal(embedded[1].replace(/\r/g, "").trim(), repositoryKey)
  // Online trust needs lospor.org to agree; there is no path that skips it.
  assert.match(bootstrap, /key_url=https:\/\/lospor\.org\/\.well-known\/lospor-release-key\.txt/)
  assert.match(bootstrap, /\[ "\$published" = "\$fingerprint" \]/)
  // Test overrides exist only behind the explicit test switch.
  const beforeTestBlock = bootstrap.slice(0, bootstrap.indexOf('if [ "$test_only" = 1 ]; then'))
  assert.doesNotMatch(beforeTestBlock, /LOSPOR_BOOTSTRAP_(KEY_URL|API_ORIGIN|DOWNLOAD_ORIGIN|HOME|PUBLIC_KEY_FILE)/)
  assert.doesNotMatch(bootstrap, /--insecure|-k |HOSPITAL_IMAGES_VERIFIED/)
})
