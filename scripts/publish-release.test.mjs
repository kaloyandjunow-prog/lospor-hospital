import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { REPOSITORY, prepare, publish, readCandidate } from "./publish-release.mjs"

const COMMIT = "0123456789abcdef0123456789abcdef01234567"
const RUN = "34719828380"

/** A fake gh: canned API answers, and a record of every command. */
function github(overrides = {}) {
  const calls = []
  const answers = {
    run: { repository: { full_name: REPOSITORY }, event: "push", conclusion: "success", head_branch: "hospital-1.4.0", head_sha: COMMIT, run_attempt: 2, workflow_id: 77 },
    workflowPath: ".github/workflows/release.yml",
    tag: { object: { type: "tag", sha: "feedface" } },
    tagObject: { object: { type: "commit", sha: COMMIT } },
    immutable: { enabled: true, enforced_by_owner: false },
    release: null,
    ...overrides,
  }
  const gh = args => {
    calls.push(args)
    const path = args[1] ?? ""
    if (args[0] === "api" && path === `repos/${REPOSITORY}/actions/runs/${RUN}`) return JSON.stringify(answers.run)
    if (args[0] === "api" && path === `repos/${REPOSITORY}/actions/workflows/77`) return `${answers.workflowPath}\n`
    if (args[0] === "api" && path.startsWith(`repos/${REPOSITORY}/git/ref/tags/`)) return JSON.stringify(answers.tag)
    if (args[0] === "api" && path === `repos/${REPOSITORY}/git/tags/feedface`) return JSON.stringify(answers.tagObject)
    if (args[0] === "api" && path === `repos/${REPOSITORY}/immutable-releases`) return JSON.stringify(answers.immutable)
    if (args[0] === "release") {
      if (!answers.release) throw new Error("release not found")
      return JSON.stringify(answers.release)
    }
    if (args[0] === "run" && args[1] === "download") {
      writeCandidate(args[args.indexOf("--dir") + 1])
      return ""
    }
    if (args[0] === "workflow") return ""
    if (args[0] === "attestation") {
      if (answers.attestation === false) throw new Error("attestation failed")
      return ""
    }
    throw new Error(`unexpected gh ${args.join(" ")}`)
  }
  return { gh, calls }
}

const lock = Buffer.from("LOSPOR-HOSPITAL-RELEASE-LOCK-V2\nrelease\t1.4.0\n")
function writeCandidate(directory) {
  mkdirSync(directory, { recursive: true })
  const name = "lospor-hospital-1.4.0-release.lock"
  writeFileSync(join(directory, name), lock)
  writeFileSync(join(directory, `${name}.sha256`), `${createHash("sha256").update(lock).digest("hex")}  ${name}\n`)
  writeFileSync(join(directory, "lospor-hospital-1.4.0-publication-request.tsv"), "request\n")
}

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), "hospital-publish-"))
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const publicKeyPath = join(cwd, "release-signing-public.pem")
  writeFileSync(publicKeyPath, publicKey.export({ type: "spki", format: "pem" }))
  const lines = []
  return { cwd, privateKey, publicKeyPath, lines, say: line => lines.push(line), node: () => undefined }
}

const directoryOf = cwd => join(cwd, `candidate-1.4.0-${RUN}-2`)

test("derives version, attempt, commit and artifact from the candidate run", () => {
  const { gh } = github()
  assert.deepEqual(readCandidate(RUN, { gh }), {
    runId: RUN, attempt: 2, version: "1.4.0", tag: "hospital-1.4.0", commit: COMMIT,
    artifactName: `hospital-1.4.0-${RUN}-2-candidate`, directory: `candidate-1.4.0-${RUN}-2`,
    lockName: "lospor-hospital-1.4.0-release.lock",
  })
})

test("refuses a run that is not a successful, tag-built release.yml candidate on its tag's commit", () => {
  const base = github().gh
  for (const [overrides, message] of [
    [{ run: { ...JSON.parse(base(["api", `repos/${REPOSITORY}/actions/runs/${RUN}`])), conclusion: "failure" } }, /did not succeed/],
    [{ run: { ...JSON.parse(base(["api", `repos/${REPOSITORY}/actions/runs/${RUN}`])), head_branch: "main" } }, /hospital-X\.Y\.Z tag/],
    [{ run: { ...JSON.parse(base(["api", `repos/${REPOSITORY}/actions/runs/${RUN}`])), event: "workflow_dispatch" } }, /pushing a release tag/],
    [{ workflowPath: ".github/workflows/quality.yml" }, /not a release\.yml candidate/],
    [{ tagObject: { object: { type: "commit", sha: "f".repeat(40) } } }, /no longer points at the commit/],
  ]) {
    assert.throws(() => readCandidate(RUN, { gh: github(overrides).gh }), message)
  }
  assert.throws(() => readCandidate("12abc", { gh: base }), /candidate run ID/)
})

const dossierSummary = {
  release: { version: "1.4.0", commit: COMMIT },
  build: { repository: REPOSITORY, workflow: ".github/workflows/release.yml", runId: RUN, runAttempt: 2, runUrl: "u" },
  images: [],
  evidence: { sboms: [] },
  vulnerabilities: { critical: 0, high: 1, exceptions: [] },
  compatibility: { rollbackPolicy: "backup-required", schemaMaximum: "m" },
  upstream: {},
}

test("prepare downloads into its own directory, verifies candidate, dossier and attestation, and prints the exact file to sign", async () => {
  const space = workspace()
  const { gh, calls } = github()
  const verified = []
  const dossierChecks = []
  await prepare(RUN, {
    ...space,
    gh,
    node: args => verified.push(args[0].split(/[\\/]/).at(-1)),
    verifyDossier: async options => { dossierChecks.push(options); return dossierSummary },
  })
  assert.deepEqual(dossierChecks.map(check => [check.runId, check.runAttempt]), [[RUN, 2]])
  assert.ok(calls.some(args => args[0] === "attestation" && args.includes(`${REPOSITORY}/.github/workflows/release.yml`)))
  assert.ok(space.lines.includes("  Vulnerabilities: 0 critical, 1 high; 0 accepted with a dated exception"))
  assert.ok(calls.some(args => args[0] === "run" && args.includes(`hospital-1.4.0-${RUN}-2-candidate`)))
  assert.deepEqual(verified, ["verify-release-candidate.mjs", "verify-release-handoff.mjs"])
  assert.ok(space.lines.some(line => line.includes("sign-release-lock.sh lospor-hospital-1.4.0-release.lock")))
  assert.ok(space.lines.some(line => line === `  node scripts/publish-release.mjs publish ${RUN}`))
  assert.ok(space.lines.includes(`Release lock SHA-256: ${createHash("sha256").update(lock).digest("hex")}`))
})

test("prepare never mixes candidates, and stops before signing without GitHub's attestation", async () => {
  const space = workspace()
  mkdirSync(directoryOf(space.cwd))
  writeFileSync(join(directoryOf(space.cwd), "other.txt"), "x")
  await assert.rejects(prepare(RUN, { ...space, gh: github().gh }), /must never be combined/)
  const unattested = workspace()
  const { gh } = github({ attestation: false })
  await assert.rejects(prepare(RUN, { ...unattested, gh, verifyDossier: async () => dossierSummary }), /attestation failed/)
  assert.ok(!unattested.lines.some(line => line.includes("sign-release-lock.sh")))
})

async function signed(space, signer = space.privateKey) {
  writeCandidate(directoryOf(space.cwd))
  writeFileSync(join(directoryOf(space.cwd), "lospor-hospital-1.4.0-release.lock.sig"), sign(null, lock, signer))
}

test("publish dispatches exactly the three inputs after the typed confirmation", async () => {
  const space = workspace()
  await signed(space)
  const { gh, calls } = github()
  const asked = []
  const result = await publish(RUN, { ...space, gh, prompt: async question => { asked.push(question); return "PUBLISH hospital-1.4.0" } })
  assert.equal(result.dispatched, true)
  assert.deepEqual(asked, ["Type PUBLISH hospital-1.4.0 to publish: "])
  const dispatch = calls.find(args => args[0] === "workflow")
  const signature = sign(null, lock, space.privateKey).toString("base64")
  assert.deepEqual(dispatch, [
    "workflow", "run", "publish-release.yml", "--repo", REPOSITORY, "--ref", "main",
    "-f", `candidate_run_id=${RUN}`, "-f", `release_signature_base64=${signature}`, "-f", "confirm_publication=PUBLISH hospital-1.4.0",
  ])
})

test("publish dispatches nothing for a wrong confirmation, a bad signature, Immutable Releases off, or a release already published", async () => {
  const wrongWords = workspace()
  await signed(wrongWords)
  const typo = github()
  assert.equal((await publish(RUN, { ...wrongWords, gh: typo.gh, prompt: async () => "PUBLISH hospital-1.4.1" })).dispatched, false)
  assert.ok(!typo.calls.some(args => args[0] === "workflow"))

  const missing = workspace()
  writeCandidate(directoryOf(missing.cwd))
  await assert.rejects(publish(RUN, { ...missing, gh: github().gh, prompt: async () => "" }), /Sign the lock on the offline machine first/)

  const otherKey = workspace()
  await signed(otherKey, generateKeyPairSync("ed25519").privateKey)
  await assert.rejects(publish(RUN, { ...otherKey, gh: github().gh, prompt: async () => "" }), /does not verify/)

  const truncated = workspace()
  writeCandidate(directoryOf(truncated.cwd))
  writeFileSync(join(directoryOf(truncated.cwd), "lospor-hospital-1.4.0-release.lock.sig"), Buffer.alloc(63))
  await assert.rejects(publish(RUN, { ...truncated, gh: github().gh, prompt: async () => "" }), /exactly 64/)

  const settingOff = workspace()
  await signed(settingOff)
  const off = github({ immutable: { enabled: false } })
  await assert.rejects(publish(RUN, { ...settingOff, gh: off.gh, prompt: async () => "PUBLISH hospital-1.4.0" }), /Immutable Releases is off/)
  assert.ok(!off.calls.some(args => args[0] === "workflow"))

  const done = workspace()
  await signed(done)
  const published = github({ release: { isDraft: false, isImmutable: true } })
  assert.equal((await publish(RUN, { ...done, gh: published.gh, prompt: async () => "PUBLISH hospital-1.4.0" })).dispatched, false)
  assert.ok(!published.calls.some(args => args[0] === "workflow"))
})

test("publish refuses a lock that no longer matches its sidecar", async () => {
  const space = workspace()
  await signed(space)
  writeFileSync(join(directoryOf(space.cwd), "lospor-hospital-1.4.0-release.lock"), Buffer.concat([lock, Buffer.from("x")]))
  await assert.rejects(publish(RUN, { ...space, gh: github().gh, prompt: async () => "" }), /does not match its \.sha256 sidecar/)
})
