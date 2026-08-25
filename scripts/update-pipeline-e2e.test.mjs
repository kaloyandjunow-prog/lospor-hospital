// The real prepare/apply release pipeline, driven end to end.
//
// scripts/update-pipeline-contract.test.mjs reads these scripts as text, and
// scripts/update-agent.test.sh replaces both of them with stubs. Neither can
// say whether a prepared release actually verifies, whether an apply that is
// handed the wrong prepared state refuses it, or whether a forged release stops
// before the appliance has changed. This runs the shipped
// prepare-verified-release.sh and apply-prepared-release.sh against a whole
// synthesized publication and asserts exactly that.
//
// A failure after a backup has started is a failure at the worst possible
// moment, so every refusal here is also checked for having happened before any
// candidate ran, any service was recreated, any image was removed, and any
// installed-release state was rewritten.

import assert from "node:assert/strict"
import { chmodSync, cpSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import {
  createAppliance,
  imageRowsOf,
  observe,
  publishRelease,
  readDescriptor,
  skipReason,
} from "./update-pipeline-e2e-lib.mjs"

const skip = skipReason()
const options = skip ? { skip } : {}

function withAppliance(body) {
  const appliance = createAppliance()
  try {
    return body(appliance)
  } finally {
    appliance.cleanup()
  }
}

// The appliance is entitled to change nothing until it has authenticated a
// release. This is what "nothing" means, spelled out.
function assertUntouched(appliance, before, context) {
  const after = observe(appliance)
  assert.equal(after.installedState, before.installedState, `${context}: installed-release state changed`)
  assert.equal(after.current, before.current, `${context}: the active release symlink moved`)
  assert.equal(after.backups, before.backups, `${context}: the backup directory changed`)
  assert.equal(after.releases, before.releases, `${context}: a release root appeared or disappeared`)
  assert.equal(after.activationHistory, before.activationHistory, `${context}: an activation was entered`)
  assert.equal(after.compose, "", `${context}: a service was created or recreated`)
  assert.equal(after.removedImages, "", `${context}: an image was removed`)
  assert.equal(after.candidateRuns, before.candidateRuns, `${context}: a candidate release ran`)
  assert.ok(
    !existsSync(join(appliance.home, ".data", "release-activation.lock")),
    `${context}: an activation lock was left behind`,
  )
}

const preparedFor = (appliance, version) =>
  join(appliance.preparedDirectory, version, "prepared-release.v2.tsv")

test("a real prepare followed by a real apply moves the appliance to exactly the requested release", options, () => {
  withAppliance(appliance => {
    const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
    appliance.serveImages("1.1.0")
    const beforeFetch = observe(appliance)

    const prepared = appliance.prepare("1.1.0", published, { requestId: "a".repeat(32) })
    assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`)

    // "Download and verify" must change no running service and no database.
    assertUntouched(appliance, beforeFetch, "fetch")
    const fetchInvocations = observe(appliance).dockerInvocations
    assert.doesNotMatch(fetchInvocations, /^compose /m, "fetch reached docker compose")
    assert.doesNotMatch(fetchInvocations, /^(run|exec|start|stop|restart|rm|kill) /m, "fetch touched a container")
    assert.match(fetchInvocations, /^pull /m, "fetch never pulled the release images")

    const descriptor = readDescriptor(appliance, "1.1.0")
    assert.equal(descriptor.header, "LOSPOR-HOSPITAL-PREPARED-RELEASE-V2")
    assert.equal(descriptor.version, "1.1.0")
    assert.equal(descriptor.tag, "hospital-1.1.0")
    assert.equal(descriptor.commit, published.commit)
    assert.equal(descriptor.lockSha, published.lockSha)
    assert.equal(descriptor.signatureSha, published.signatureSha)
    assert.equal(descriptor.releaseId, String(published.releaseId))
    assert.equal(descriptor.installedVersion, appliance.installedVersion)
    assert.equal(descriptor.imageSetSha, published.imageSetSha)
    assert.equal(descriptor.rollbackPolicy, "service-compatible")

    const preparedLock = join(descriptor.root, "lospor-hospital-1.1.0-release.lock")
    assert.deepEqual(imageRowsOf(preparedLock), imageRowsOf(published.lock),
      "the staged lock does not carry the published image identities")

    const projection = JSON.parse(appliance.read(
      join(appliance.home, ".data", "runtime", "update", "state", "update-agent.v2.json")))
    assert.equal(projection.phase, "prepared")
    assert.equal(projection.preparedVersion, "1.1.0")
    assert.equal(projection.preparedLockSha256, published.lockSha)

    const applied = appliance.apply("1.1.0", { requestId: "a".repeat(32) })
    assert.equal(applied.status, 0, `${applied.stdout}\n${applied.stderr}`)

    // The requested version, the prepared lock, the image identities and the
    // version now running are one identity, not four that usually agree.
    const activeRoot = join(appliance.home, ".data", "releases", "1.1.0", "lospor-hospital-1.1.0")
    const activeLock = join(activeRoot, ".release", "release.lock")
    assert.equal(readFileSync(activeLock, "utf8"), readFileSync(published.lock, "utf8"))
    assert.deepEqual(imageRowsOf(activeLock), imageRowsOf(published.lock))
    assert.match(
      appliance.read(join(appliance.home, ".data", "installed-release.tsv")),
      new RegExp(`^LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1\\.1\\.0\t\\.data/releases/1\\.1\\.0/lospor-hospital-1\\.1\\.0\t${published.lockSha}\n$`),
    )
    assert.equal(observe(appliance).current, activeRoot)
    assert.equal(
      appliance.read(join(appliance.home, ".data", "previous-installed-release.tsv")).split("\t")[1],
      appliance.installedVersion,
    )

    // The candidate that ran is the prepared one, named by its lock digest.
    assert.match(appliance.read(appliance.record),
      new RegExp(`^candidate\t1\\.1\\.0\t${published.lockSha}\t`, "m"))

    const transition = appliance.read(join(appliance.home, ".data", "update-private", "transition.v2.tsv")).split("\t")
    assert.equal(transition[2], "COMPLETED")
    assert.equal(transition[5], "1.1.0")
    assert.equal(transition[7].trim(), published.lockSha)
    assert.ok(!existsSync(preparedFor(appliance, "1.1.0")), "the consumed prepared release was retained")
  })
})

test("apply refuses missing, mismatched and stale prepared state", options, async t => {
  await t.test("a version that was never prepared", () => {
    withAppliance(appliance => {
      const before = observe(appliance)
      const applied = appliance.apply("1.1.0")
      assert.notEqual(applied.status, 0)
      assert.match(applied.stderr, /UPDATE_PREPARED_DESCRIPTOR_INVALID/)
      assertUntouched(appliance, before, "apply without preparation")
    })
  })

  await t.test("a different version than the one prepared", () => {
    withAppliance(appliance => {
      const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
      appliance.serveImages("1.1.0")
      assert.equal(appliance.prepare("1.1.0", published).status, 0)
      const before = observe(appliance)
      const applied = appliance.apply("1.2.0")
      assert.notEqual(applied.status, 0)
      assert.match(applied.stderr, /UPDATE_PREPARED_DESCRIPTOR_INVALID/)
      assertUntouched(appliance, before, "apply of an unprepared version")
    })
  })

  await t.test("a descriptor prepared against a different installed release", () => {
    withAppliance(appliance => {
      const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
      appliance.serveImages("1.1.0")
      assert.equal(appliance.prepare("1.1.0", published).status, 0)
      const path = preparedFor(appliance, "1.1.0")
      const fields = readFileSync(path, "utf8").replace(/\n$/, "").split("\t")
      fields[11] = "1.0.1"
      chmodSync(path, 0o600)
      writeFileSync(path, `${fields.join("\t")}\n`)
      const before = observe(appliance)
      const applied = appliance.apply("1.1.0")
      assert.notEqual(applied.status, 0)
      assert.match(applied.stderr, /UPDATE_PREPARED_FROM_DIFFERENT_RELEASE/)
      assertUntouched(appliance, before, "apply of a descriptor from another release")
    })
  })

  await t.test("staged bytes that no longer match the descriptor", () => {
    withAppliance(appliance => {
      const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
      appliance.serveImages("1.1.0")
      assert.equal(appliance.prepare("1.1.0", published).status, 0)
      const descriptor = readDescriptor(appliance, "1.1.0")
      const staged = join(descriptor.root, "lospor-hospital-1.1.0-release.lock")
      chmodSync(staged, 0o600)
      writeFileSync(staged, readFileSync(staged, "utf8").replace(published.commit, "b".repeat(40)))
      const before = observe(appliance)
      const applied = appliance.apply("1.1.0")
      assert.notEqual(applied.status, 0)
      assert.match(applied.stderr, /UPDATE_PREPARED_DESCRIPTOR_INVALID/)
      assertUntouched(appliance, before, "apply of tampered prepared state")
    })
  })
})

test("a release that does not authenticate never reaches a backup or a service", options, async t => {
  const cases = [
    {
      // The publisher's own record still names the original bytes, so this
      // never reaches the signature: the download is refused on the digest.
      name: "a lock swapped for other bytes after publication",
      publish: appliance => {
        const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
        published.corruptStagedLock()
        return published
      },
      expect: /UPDATE_RELEASE_ASSET_DIGEST_MISMATCH/,
    },
    {
      // An attacker who controls the whole publication but not the signing key
      // can restate every digest they publish. The signature is what is left.
      name: "a lock tampered with after it was signed",
      publish: appliance => publishRelease(appliance.directory, "1.1.0", {
        privateKey: appliance.maintainerKey,
        corruptLockAfterSigning: true,
      }),
      expect: /RELEASE SIGNATURE DOES NOT VERIFY/,
    },
    {
      name: "a signature made by a key this appliance does not trust",
      publish: appliance => publishRelease(appliance.directory, "1.1.0", {
        privateKey: appliance.attackerKey,
      }),
      expect: /RELEASE SIGNATURE DOES NOT VERIFY/,
    },
    {
      name: "a mutable tag substituted for a pinned digest",
      publish: appliance => publishRelease(appliance.directory, "1.1.0", {
        privateKey: appliance.maintainerKey,
        mutateLock: lines => lines.map(line => line.startsWith("image\tapi\t")
          ? line.split("\t").map((field, index) => (index === 3 ? "latest" : field)).join("\t")
          : line),
      }),
      expect: /Invalid registry digest for api/,
    },
    {
      name: "an image the registry cannot serve",
      publish: appliance => publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey }),
      serve: appliance => appliance.serveImages("1.1.0", { omit: ["web"] }),
      expect: /fake docker cannot pull|lospor-hospital-web/,
    },
  ]
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      withAppliance(appliance => {
        const published = scenario.publish(appliance)
        if (scenario.serve) scenario.serve(appliance)
        else appliance.serveImages("1.1.0")
        const before = observe(appliance)
        const prepared = appliance.prepare("1.1.0", published)
        assert.notEqual(prepared.status, 0, "a forged release was prepared")
        assert.match(`${prepared.stdout}\n${prepared.stderr}`, scenario.expect)
        assert.ok(!existsSync(preparedFor(appliance, "1.1.0")), "a refused release was still published as prepared")
        assertUntouched(appliance, before, scenario.name)
      })
    })
  }

  await t.test("a downgrade below the installed release", () => {
    withAppliance(appliance => {
      const published = publishRelease(appliance.directory, "0.9.0", { privateKey: appliance.maintainerKey })
      appliance.serveImages("0.9.0")
      const before = observe(appliance)
      const prepared = appliance.prepare("0.9.0", published)
      assert.notEqual(prepared.status, 0)
      assert.match(prepared.stderr, /Refusing to downgrade Hospital from 1\.0\.0 to 0\.9\.0/)
      assert.ok(!existsSync(preparedFor(appliance, "0.9.0")))
      // A downgrade is refused from authenticated metadata alone, before the
      // pipeline asks the registry for anything.
      assert.doesNotMatch(observe(appliance).dockerInvocations, /^pull /m, "a refused downgrade still pulled images")
      assertUntouched(appliance, before, "downgrade")
    })
  })
})

test("apply refuses to start while another destructive operation owns the appliance", options, async t => {
  await t.test("an activation lock left by an earlier attempt", () => {
    withAppliance(appliance => {
      const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
      appliance.serveImages("1.1.0")
      assert.equal(appliance.prepare("1.1.0", published).status, 0)
      const lock = join(appliance.home, ".data", "release-activation.lock")
      writeFileSync(lock, "")
      const before = observe(appliance)
      const applied = appliance.apply("1.1.0")
      assert.notEqual(applied.status, 0)
      assert.match(applied.stderr, /UPDATE_ACTIVATION_LOCK_PRESENT/)
      assert.equal(observe(appliance).installedState, before.installedState)
      assert.equal(observe(appliance).candidateRuns, before.candidateRuns)
    })
  })

  await t.test("a backup already running", () => {
    withAppliance(appliance => {
      const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
      appliance.serveImages("1.1.0")
      assert.equal(appliance.prepare("1.1.0", published).status, 0)
      writeFileSync(join(appliance.home, "backups", ".lospor-backup.lock"), "")
      const applied = appliance.apply("1.1.0")
      assert.notEqual(applied.status, 0)
      assert.match(applied.stderr, /UPDATE_BACKUP_BUSY/)
      assert.equal(observe(appliance).candidateRuns, "")
    })
  })
})

test("preparing the same release twice is idempotent and never republishes a second identity", options, () => {
  withAppliance(appliance => {
    const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
    appliance.serveImages("1.1.0")
    assert.equal(appliance.prepare("1.1.0", published).status, 0)
    const first = readFileSync(preparedFor(appliance, "1.1.0"), "utf8")
    const again = appliance.prepare("1.1.0", published)
    assert.equal(again.status, 0, `${again.stdout}\n${again.stderr}`)
    assert.equal(readFileSync(preparedFor(appliance, "1.1.0"), "utf8"), first,
      "a second preparation rewrote the prepared identity")
    assert.match(again.stdout, /already prepared/)
  })
})

test("applying the release that is already installed is a truthful completion, not a second activation", options, () => {
  withAppliance(appliance => {
    const published = publishRelease(appliance.directory, "1.1.0", { privateKey: appliance.maintainerKey })
    appliance.serveImages("1.1.0")
    assert.equal(appliance.prepare("1.1.0", published).status, 0)
    // A duplicated request, or an operator who activated the same release
    // through the verified launcher while a prepared copy still existed.
    const held = join(appliance.directory, "held-prepared-1.1.0")
    cpSync(join(appliance.preparedDirectory, "1.1.0"), held, { recursive: true })
    assert.equal(appliance.apply("1.1.0").status, 0)
    const runsAfterFirstApply = appliance.read(appliance.record)

    cpSync(held, join(appliance.preparedDirectory, "1.1.0"), { recursive: true })
    const repeated = appliance.apply("1.1.0")
    assert.equal(repeated.status, 0, `${repeated.stdout}\n${repeated.stderr}`)
    assert.equal(appliance.read(appliance.record), runsAfterFirstApply,
      "the candidate ran a second time for a release that was already active")
    const transition = appliance.read(join(appliance.home, ".data", "update-private", "transition.v2.tsv")).split("\t")
    assert.equal(transition[2], "COMPLETED")
    assert.equal(transition[6], "UPDATE_ALREADY_INSTALLED")
    assert.ok(!existsSync(preparedFor(appliance, "1.1.0")))
  })
})
