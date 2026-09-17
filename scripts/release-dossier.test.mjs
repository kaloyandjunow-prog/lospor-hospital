import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createReleaseDossier, summarizeReleaseDossier, verifyReleaseDossier } from "./release-dossier-lib.mjs"
import { verifyEvidenceArchive } from "./verify-release-dossier.mjs"

const IMAGES = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]
const COMMIT = "0123456789abcdef0123456789abcdef01234567"
const sha = bytes => createHash("sha256").update(bytes).digest("hex")

async function release() {
  const root = await mkdtemp(join(tmpdir(), "hospital-dossier-"))
  const evidence = join(root, "release-evidence")
  await mkdir(join(evidence, "vulnerabilities"), { recursive: true })
  await mkdir(join(evidence, "sboms"), { recursive: true })
  await mkdir(join(evidence, "postgres-source-provenance"), { recursive: true })
  for (const name of IMAGES) {
    const findings = name === "postgres"
      ? [
          { VulnerabilityID: "CVE-2026-16742", PkgName: "libsystemd0", Severity: "HIGH" },
          { VulnerabilityID: "CVE-2026-16742", PkgName: "libsystemd0", Severity: "HIGH" },
          { VulnerabilityID: "CVE-2026-1", PkgName: "zlib", Severity: "LOW" },
        ]
      : []
    await writeFile(join(evidence, "vulnerabilities", `${name}.json`), JSON.stringify({ Results: [{ Vulnerabilities: findings }] }))
    await writeFile(join(evidence, "sboms", `${name}.cdx.json`), JSON.stringify({ components: [{}, {}, {}] }))
  }
  const exceptions = { schemaVersion: 1, exceptions: [
    { release: "1.4.0", image: "postgres", vulnerabilityId: "CVE-2026-16742", package: "libsystemd0", expiresAt: "2026-12-08", justification: "not reachable in this container at all" },
    { release: "1.3.3", image: "api", vulnerabilityId: "CVE-2026-9", package: "old", expiresAt: "2026-10-01", justification: "belongs to an older release entirely" },
  ] }
  await writeFile(join(evidence, "risk-exceptions.json"), JSON.stringify(exceptions))
  const imageLock = { schemaVersion: 1, images: IMAGES.map((name, index) => ({
    name, reference: `ghcr.io/kaloyandjunow-prog/lospor-hospital-${name}:1.4.0`, digest: `sha256:${String(index).repeat(64).slice(0, 64)}`,
  })) }
  await writeFile(join(evidence, "image-lock.json"), JSON.stringify(imageLock))
  await writeFile(join(evidence, "postgres-source-provenance", "postgres-source-provenance.json"), "{}")
  const deployment = join(root, "lospor-hospital-1.4.0-deployment.tar.gz")
  const part = join(root, "lospor-hospital-1.4.0-images.tar.gz.part-000")
  await writeFile(deployment, "deployment")
  await writeFile(part, "offline images")
  const dossier = await createReleaseDossier({
    version: "1.4.0", commit: COMMIT, createdAt: "2026-09-14T08:00:00.000Z",
    repository: "kaloyandjunow-prog/lospor-hospital", runId: "34719828380", runAttempt: 2,
    imageLock, deploymentArchive: deployment, offlineArchives: [part], evidenceDirectory: evidence,
    compatibilityText: "LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.4.0\t20260530000000_init\t20260913130000_external_ai_models\tbackup-required\t-\t0\n",
    riskExceptions: exceptions,
    upstream: { sources: { api: { version: "9.9.5", commit: COMMIT }, exchangeContract: { version: "2.4.0", sha256: "a".repeat(64) } } },
  })
  const lockText = [
    "LOSPOR-HOSPITAL-RELEASE-LOCK-V2",
    ["release", "1.4.0", "hospital-1.4.0", COMMIT, "linux/amd64", "2026-09-14T08:00:00.000Z", "b".repeat(64)].join("\t"),
    ["artifact", "manifest", "000", "lospor-hospital-1.4.0-manifest.json", 10, "c".repeat(64)].join("\t"),
    ["artifact", "deployment", "000", "lospor-hospital-1.4.0-deployment.tar.gz", 10, sha("deployment")].join("\t"),
    ["artifact", "security-evidence", "000", "lospor-hospital-1.4.0-security-evidence.tar.gz", 10, "d".repeat(64)].join("\t"),
    ["artifact", "offline-part", "000", "lospor-hospital-1.4.0-images.tar.gz.part-000", 14, sha("offline images")].join("\t"),
    ...imageLock.images.map(image => ["image", image.name, image.reference, image.digest, "sha256:x", "sha256:y", "linux/amd64", "sha256:z"].join("\t")),
  ].join("\n") + "\n"
  return { root, evidence, dossier, lockText }
}

test("indexes the release: identity, run, compatibility, findings, evidence and pins", async () => {
  const { dossier } = await release()
  assert.deepEqual(dossier.build, {
    repository: "kaloyandjunow-prog/lospor-hospital", workflow: ".github/workflows/release.yml", runId: "34719828380", runAttempt: 2,
    runUrl: "https://github.com/kaloyandjunow-prog/lospor-hospital/actions/runs/34719828380/attempts/2",
  })
  assert.equal(dossier.vulnerabilities.high, 1, "the same finding in two targets counts once, and LOW is not counted")
  assert.equal(dossier.vulnerabilities.critical, 0)
  assert.deepEqual(dossier.vulnerabilities.exceptions, [{ image: "postgres", vulnerabilityId: "CVE-2026-16742", package: "libsystemd0", expiresAt: "2026-12-08" }])
  assert.equal(dossier.compatibility.rollbackPolicy, "backup-required")
  assert.deepEqual(dossier.upstream, { api: { version: "9.9.5", identity: `commit:${COMMIT}` }, exchangeContract: { version: "2.4.0", identity: `sha256:${"a".repeat(64)}` } })
  assert.equal(dossier.evidence.sboms.length, 10)
  const summary = summarizeReleaseDossier(dossier)
  assert.ok(summary.includes("Vulnerabilities: 0 critical, 1 high; 1 accepted with a dated exception (first expires 2026-12-08)"))
  assert.ok(summary.includes("Updating to it: a verified backup is required to go back after migration"))
})

test("verifies against the signed lock and the evidence files it names", async () => {
  const { evidence, dossier, lockText } = await release()
  await verifyReleaseDossier({ dossier, lockText, evidenceDirectory: evidence, expectedRunId: "34719828380", expectedRunAttempt: 2 })
})

test("refuses a dossier that does not describe the locked release, run or evidence", async () => {
  const { evidence, dossier, lockText } = await release()
  const clone = () => JSON.parse(JSON.stringify(dossier))
  const refuse = async (mutate, message, options = {}) => {
    const changed = clone()
    mutate(changed)
    await assert.rejects(verifyReleaseDossier({ dossier: changed, lockText, evidenceDirectory: evidence, ...options }), message)
  }
  await refuse(value => { value.release.commit = "f".repeat(40) }, /but the lock is/)
  await refuse(value => { value.artifacts.deployment.sha256 = "0".repeat(64) }, /deployment archive is not the one in the lock/)
  await refuse(value => { value.images[0].digest = `sha256:${"9".repeat(64)}` }, /images are not the ones in the lock/)
  await refuse(() => {}, /not run 1 attempt 2/, { expectedRunId: "1", expectedRunAttempt: 2 })
  await refuse(value => { value.vulnerabilities.perImage.api.high = 5 }, /do not add up/)
  await refuse(value => { value.signer = "someone" }, /exactly/)
  await writeFile(join(evidence, "sboms", "api.cdx.json"), "{\"components\":[]}")
  await assert.rejects(verifyReleaseDossier({ dossier: clone(), lockText, evidenceDirectory: evidence }), /sboms\/api\.cdx\.json does not match/)
})

test("reads and verifies the dossier from the security evidence archive", async () => {
  const { root, evidence, dossier, lockText } = await release()
  await writeFile(join(evidence, "release-dossier.json"), `${JSON.stringify(dossier, null, 2)}\n`)
  const lockPath = join(root, "release.lock")
  await writeFile(lockPath, lockText)
  const archive = join(root, "evidence.tar.gz")
  assert.equal(spawnSync("tar", ["-czf", "evidence.tar.gz", "release-evidence"], { cwd: root }).status, 0)
  const verified = await verifyEvidenceArchive({ archive, lockPath, runId: "34719828380", runAttempt: 2 })
  assert.equal(verified.release.version, "1.4.0")
  await assert.rejects(verifyEvidenceArchive({ archive, lockPath, runId: "34719828380", runAttempt: 1 }), /not run 34719828380 attempt 1/)

  await rm(join(evidence, "release-dossier.json"))
  const bare = join(root, "bare.tar.gz")
  assert.equal(spawnSync("tar", ["-czf", "bare.tar.gz", "release-evidence"], { cwd: root }).status, 0)
  await assert.rejects(verifyEvidenceArchive({ archive: bare, lockPath }), /has no release-dossier\.json/)
})
