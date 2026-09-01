import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
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

test("per-hospital publication credentials never travel in argv or environment", async () => {
  const provision = await source("scripts/provision-update-credentials.sh")
  const prepare = await source("scripts/prepare-verified-release.sh")
  const online = await source("scripts/run-online-release.sh")
  const check = await source("scripts/check-for-update.sh")
  assert.match(provision, /^#!\/bin\/sh\nset -eu\nset \+x/m)
  assert.match(provision, /IFS= read -r read_result/)
  assert.match(provision, /github-release-token/)
  assert.match(provision, /ghcr-user/)
  assert.match(provision, /ghcr-token/)
  for (const consumer of [prepare, online, check]) {
    assert.doesNotMatch(consumer, /HOSPITAL_GITHUB_RELEASE_TOKEN|HOSPITAL_GHCR_USER|HOSPITAL_GHCR_READ_TOKEN/)
    assert.doesNotMatch(consumer, /--user\s+"[^\n]*token/i)
  }
  assert.match(online, /--password-stdin/)
  assert.match(check, /--config "\$basic_auth_config"/)
  assert.match(check, /--config "\$bearer_auth_config"/)
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
