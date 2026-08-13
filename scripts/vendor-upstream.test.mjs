import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import {
  VendorError,
  applyVendorStage,
  checkVendorMerge,
  hashDirectory,
  stageVendorMerge,
  writeJsonReport,
} from "./vendor-upstream-engine.mjs"

const temporaryRoots = []

test.after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true })
})

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 24,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim()
}

function initRepository(path) {
  mkdirSync(path, { recursive: true })
  git(path, "init", "--quiet")
  git(path, "config", "user.email", "tests@lospor.local")
  git(path, "config", "user.name", "LOSPOR tests")
  git(path, "config", "core.autocrlf", "false")
  git(path, "config", "core.safecrlf", "false")
  git(path, "config", "core.quotepath", "false")
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function commit(repository, message) {
  git(repository, "add", "-A")
  git(repository, "commit", "--quiet", "-m", message)
  return git(repository, "rev-parse", "HEAD")
}

function exportTree(repository, ref, destination) {
  mkdirSync(destination, { recursive: true })
  const archive = execFileSync("git", ["archive", "--format=tar", ref], {
    cwd: repository,
    maxBuffer: 1 << 24,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  })
  execFileSync("tar", ["-x"], {
    cwd: destination,
    input: archive,
    maxBuffer: 1 << 24,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  })
}

function standardBase(repository) {
  write(join(repository, ".gitattributes"), "* text=auto eol=lf\n*.bin binary\n")
  write(join(repository, "unchanged.txt"), "unchanged\n")
  write(join(repository, "upstream-edit.txt"), "base\n")
  write(join(repository, "delete.txt"), "delete me\n")
  write(join(repository, "ours.txt"), "base\n")
  write(join(repository, "same.txt"), "base\n")
  write(join(repository, "crlf.txt"), "alpha\r\nbeta\r\n")
  write(join(repository, "unicode", "операция.txt"), "начало\n")
  write(join(repository, "binary.bin"), Buffer.from([0, 1, 2, 3]))
}

function cleanTarget(repository) {
  write(join(repository, "upstream-edit.txt"), "upstream\n")
  rmSync(join(repository, "delete.txt"))
  write(join(repository, "added", "new.txt"), "new\n")
  write(join(repository, "same.txt"), "shared edit\n")
  write(join(repository, "crlf.txt"), "alpha\nbeta\n")
  write(join(repository, "unicode", "операция.txt"), "край\n")
  write(join(repository, "binary.bin"), Buffer.from([0, 9, 2, 3]))
}

function cleanOurs(target) {
  write(join(target, "ours.txt"), "hospital\n")
  write(join(target, "same.txt"), "shared edit\n")
  // The committed blob is LF despite this Windows-style working copy.
  write(join(target, "crlf.txt"), "alpha\r\nbeta\r\n")
}

function addNestedHospitalRepository(target) {
  write(join(target, ".git", "HEAD"), "ref: refs/heads/main\n")
  write(join(target, ".git", "config"), "[core]\n\trepositoryformatversion = 0\n")
}

function fixture({
  baseVersion = "1.0.0",
  targetVersion = "1.1.0",
  base = standardBase,
  theirs = cleanTarget,
  ours = cleanOurs,
} = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), "lospor-vendor-test-"))
  temporaryRoots.push(sandbox)
  const upstreamRoot = join(sandbox, "upstreams")
  const upstream = join(upstreamRoot, "lospor-api")
  const hospital = join(sandbox, "hospital")
  const target = join(hospital, "apps", "api")

  initRepository(upstream)
  base(upstream)
  const baseCommit = commit(upstream, "base")
  git(upstream, "tag", `v${baseVersion}`)
  theirs(upstream)
  const targetCommit = commit(upstream, "target")
  git(upstream, "tag", `v${targetVersion}`)

  initRepository(hospital)
  exportTree(upstream, baseCommit, target)
  ours(target)
  write(join(hospital, "sentinel.txt"), "outside vendored target\n")
  commit(hospital, "hospital source")
  const treeOid = git(hospital, "rev-parse", "HEAD:apps/api")
  const manifest = {
    importedAt: "2026-01-01T00:00:00.000Z",
    sources: {
      api: {
        repository: "test/lospor-api",
        version: baseVersion,
        commit: baseCommit,
        path: "apps/api",
        treeOid,
      },
    },
  }
  write(join(hospital, "UPSTREAM_VERSIONS.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  commit(hospital, "pin source")

  return {
    sandbox,
    upstreamRoot,
    upstream,
    hospital,
    target,
    baseCommit,
    targetCommit,
    baseVersion,
    targetVersion,
    options: { root: hospital, upstreamRoot, sourceName: "api", targetVersion },
  }
}

function snapshot(fix) {
  return {
    target: hashDirectory(fix.target),
    manifest: readFileSync(join(fix.hospital, "UPSTREAM_VERSIONS.json")),
    sentinel: readFileSync(join(fix.hospital, "sentinel.txt")),
    upstreamHead: git(fix.upstream, "rev-parse", "HEAD"),
    upstreamStatus: git(fix.upstream, "status", "--porcelain=v1", "--untracked-files=all"),
  }
}

function assertUnchanged(fix, before) {
  assert.equal(hashDirectory(fix.target), before.target)
  assert.deepEqual(readFileSync(join(fix.hospital, "UPSTREAM_VERSIONS.json")), before.manifest)
  assert.deepEqual(readFileSync(join(fix.hospital, "sentinel.txt")), before.sentinel)
  assert.equal(git(fix.upstream, "rev-parse", "HEAD"), before.upstreamHead)
  assert.equal(
    git(fix.upstream, "status", "--porcelain=v1", "--untracked-files=all"),
    before.upstreamStatus,
  )
}

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof VendorError && error.code === code)
}

test("clean check merges additions, deletions, identical edits, binary changes, CRLF and Unicode without writes", () => {
  const fix = fixture()
  const before = snapshot(fix)
  const report = checkVendorMerge(fix.options)
  assert.equal(report.status, "clean")
  assert.deepEqual(report.conflicts, [])
  assert(report.upstreamChanges.includes("added/new.txt"))
  assert(report.upstreamChanges.includes("delete.txt"))
  assert(report.upstreamChanges.includes("binary.bin"))
  assert(
    report.upstreamChanges.some(path => path.startsWith("unicode/")),
    `Unicode-path change missing from ${JSON.stringify(report.upstreamChanges)}`,
  )
  assert(report.resultChanges.includes("ours.txt") === false)
  assert( /^[0-9a-f]{40}$/.test(report.result.treeOid))
  assert.match(report.result.sha256, /^[0-9a-f]{64}$/)
  assertUnchanged(fix, before)
  assert.deepEqual(readdirSync(fix.sandbox).sort(), ["hospital", "upstreams"])
})

test("a clean stage is new, reviewable, LF-canonical, and applies without changing the manifest or sentinel", () => {
  const fix = fixture()
  const stagePath = join(fix.sandbox, "review-stage")
  const manifestBefore = readFileSync(join(fix.hospital, "UPSTREAM_VERSIONS.json"))
  const sentinelBefore = readFileSync(join(fix.hospital, "sentinel.txt"))
  const staged = stageVendorMerge({ ...fix.options, stagePath })
  assert.equal(staged.status, "clean")
  assert.equal(staged.hospital.head, git(fix.hospital, "rev-parse", "HEAD"))
  assert.equal(staged.base.commit, fix.baseCommit)
  assert.equal(staged.ours.treeOid, git(fix.hospital, "rev-parse", "HEAD:apps/api"))
  assert.equal(staged.theirs.commit, fix.targetCommit)
  assert.equal(staged.result.sha256, hashDirectory(join(stagePath, "result")))
  assert.equal(readFileSync(join(stagePath, "result", "crlf.txt"), "utf8"), "alpha\nbeta\n")
  assert.equal(existsSync(join(stagePath, "result", "delete.txt")), false)
  assert.equal(readFileSync(join(stagePath, "result", "ours.txt"), "utf8"), "hospital\n")

  const applied = applyVendorStage({
    root: fix.hospital,
    upstreamRoot: fix.upstreamRoot,
    stagePath,
  })
  assert.equal(applied.status, "applied")
  assert.equal(hashDirectory(fix.target), staged.result.sha256)
  assert.equal(readFileSync(join(fix.target, "upstream-edit.txt"), "utf8"), "upstream\n")
  assert.deepEqual(readFileSync(join(fix.hospital, "UPSTREAM_VERSIONS.json")), manifestBefore)
  assert.deepEqual(readFileSync(join(fix.hospital, "sentinel.txt")), sentinelBefore)
  assert.equal(existsSync(stagePath), true)
  const leftovers = readdirSync(join(fix.hospital, "apps"))
    .filter(name => name.startsWith(".lospor-vendor-"))
  assert.deepEqual(leftovers, [])
})

test("text, delete/modify, and binary conflicts are reported without touching Hospital or upstream", () => {
  const fix = fixture({
    base(repository) {
      write(join(repository, ".gitattributes"), "* text=auto eol=lf\n*.bin binary\n")
      write(join(repository, "both.txt"), "base\n")
      write(join(repository, "delete-modify.txt"), "base\n")
      write(join(repository, "binary.bin"), Buffer.from([0, 1, 2]))
    },
    theirs(repository) {
      write(join(repository, "both.txt"), "upstream\n")
      rmSync(join(repository, "delete-modify.txt"))
      write(join(repository, "binary.bin"), Buffer.from([0, 2, 2]))
    },
    ours(target) {
      write(join(target, "both.txt"), "hospital\n")
      write(join(target, "delete-modify.txt"), "hospital\n")
      write(join(target, "binary.bin"), Buffer.from([0, 3, 2]))
    },
  })
  const before = snapshot(fix)
  const report = checkVendorMerge(fix.options)
  assert.equal(report.status, "conflicts")
  assert.deepEqual(
    [...report.conflicts].sort(),
    ["binary.bin", "both.txt", "delete-modify.txt"],
  )
  assert.equal(report.result.treeOid, null)
  assertUnchanged(fix, before)

  const stagePath = join(fix.sandbox, "conflict-stage")
  const staged = stageVendorMerge({ ...fix.options, stagePath })
  assert.equal(staged.status, "conflicts")
  expectCode(
    () => applyVendorStage({ root: fix.hospital, upstreamRoot: fix.upstreamRoot, stagePath }),
    "UNRESOLVED_STAGE",
  )
  assertUnchanged(fix, before)
})

test("stage creation refuses an existing path without changing it or the repositories", () => {
  const fix = fixture()
  const before = snapshot(fix)
  const stagePath = join(fix.sandbox, "existing")
  mkdirSync(stagePath)
  write(join(stagePath, "keep.txt"), "keep\n")
  expectCode(() => stageVendorMerge({ ...fix.options, stagePath }), "STAGE_EXISTS")
  assert.equal(readFileSync(join(stagePath, "keep.txt"), "utf8"), "keep\n")
  assertUnchanged(fix, before)
})

test("JSON reports are machine-readable and never overwrite an existing file", () => {
  const fix = fixture()
  const report = checkVendorMerge(fix.options)
  const path = join(fix.sandbox, "merge-report.json")
  writeJsonReport(path, report)
  const stored = JSON.parse(readFileSync(path, "utf8"))
  assert.equal(stored.mode, "check")
  assert.equal(stored.source, "api")
  assert.equal(stored.result.sha256, report.result.sha256)
  expectCode(() => writeJsonReport(path, report), "REPORT_EXISTS")
})

test("stage creation refuses a directory inside the vendored target", () => {
  const fix = fixture()
  const before = snapshot(fix)
  expectCode(
    () => stageVendorMerge({ ...fix.options, stagePath: join(fix.target, "review") }),
    "UNSAFE_STAGE_PATH",
  )
  assertUnchanged(fix, before)
})

test("a nested .git directory in the vendored source is rejected", () => {
  const fix = fixture({ ours: addNestedHospitalRepository })
  expectCode(() => checkVendorMerge(fix.options), "NESTED_REPOSITORY")
})

test("tracked and untracked target dirt are both refused", async t => {
  await t.test("tracked", () => {
    const fix = fixture()
    write(join(fix.target, "ours.txt"), "dirty\n")
    expectCode(() => checkVendorMerge(fix.options), "DIRTY_TARGET")
  })
  await t.test("untracked", () => {
    const fix = fixture()
    write(join(fix.target, "untracked.txt"), "dirty\n")
    expectCode(() => checkVendorMerge(fix.options), "DIRTY_TARGET")
  })
})

test("only a locally present exact stable forward tag is accepted", async t => {
  await t.test("prerelease syntax", () => {
    const fix = fixture()
    expectCode(
      () => checkVendorMerge({ ...fix.options, targetVersion: "1.2.0-rc.1" }),
      "INVALID_VERSION",
    )
  })
  await t.test("missing exact tag", () => {
    const fix = fixture()
    expectCode(
      () => checkVendorMerge({ ...fix.options, targetVersion: "1.2.0" }),
      "MISSING_STABLE_TAG",
    )
  })
  await t.test("downgrade", () => {
    const fix = fixture({ baseVersion: "2.0.0", targetVersion: "2.1.0" })
    expectCode(
      () => checkVendorMerge({ ...fix.options, targetVersion: "1.9.9" }),
      "NON_FORWARD_VERSION",
    )
  })
})

test("the manifest's pinned version must resolve to its recorded commit", () => {
  const fix = fixture()
  git(fix.upstream, "tag", "--force", `v${fix.baseVersion}`, fix.targetCommit)
  expectCode(() => checkVendorMerge(fix.options), "PIN_VERSION_MISMATCH")
})

test("a missing pinned commit is refused", () => {
  const fix = fixture()
  const path = join(fix.hospital, "UPSTREAM_VERSIONS.json")
  const manifest = JSON.parse(readFileSync(path, "utf8"))
  manifest.sources.api.commit = "0".repeat(40)
  write(path, `${JSON.stringify(manifest, null, 2)}\n`)
  commit(fix.hospital, "bad pin")
  expectCode(() => checkVendorMerge(fix.options), "MISSING_PINNED_COMMIT")
})

test("apply refuses stale HEAD, manifest, target, upstream tag, and result", async t => {
  function stagedFixture() {
    const fix = fixture()
    const stagePath = join(fix.sandbox, "stage")
    stageVendorMerge({ ...fix.options, stagePath })
    return { fix, stagePath, before: snapshot(fix) }
  }

  await t.test("HEAD", () => {
    const { fix, stagePath } = stagedFixture()
    write(join(fix.hospital, "other.txt"), "new commit\n")
    commit(fix.hospital, "move head")
    expectCode(
      () => applyVendorStage({ root: fix.hospital, upstreamRoot: fix.upstreamRoot, stagePath }),
      "STALE_STAGE",
    )
  })
  await t.test("manifest", () => {
    const { fix, stagePath } = stagedFixture()
    const manifest = join(fix.hospital, "UPSTREAM_VERSIONS.json")
    write(manifest, readFileSync(manifest, "utf8").replace("2026-01-01", "2026-01-02"))
    expectCode(
      () => applyVendorStage({ root: fix.hospital, upstreamRoot: fix.upstreamRoot, stagePath }),
      "STALE_STAGE",
    )
  })
  await t.test("target", () => {
    const { fix, stagePath } = stagedFixture()
    write(join(fix.target, "dirty.txt"), "dirty\n")
    expectCode(
      () => applyVendorStage({ root: fix.hospital, upstreamRoot: fix.upstreamRoot, stagePath }),
      "DIRTY_TARGET",
    )
  })
  await t.test("upstream tag", () => {
    const { fix, stagePath } = stagedFixture()
    git(fix.upstream, "tag", "--force", `v${fix.targetVersion}`, fix.baseCommit)
    expectCode(
      () => applyVendorStage({ root: fix.hospital, upstreamRoot: fix.upstreamRoot, stagePath }),
      "STALE_STAGE",
    )
  })
  await t.test("result", () => {
    const { fix, stagePath } = stagedFixture()
    write(join(stagePath, "result", "tampered.txt"), "tampered\n")
    expectCode(
      () => applyVendorStage({ root: fix.hospital, upstreamRoot: fix.upstreamRoot, stagePath }),
      "STALE_STAGE",
    )
  })
})

test("apply rolls back byte-for-byte after failures on either side of promotion", async t => {
  for (const point of ["after-backup", "after-promote"]) {
    await t.test(point, () => {
      const fix = fixture()
      const stagePath = join(fix.sandbox, "stage")
      stageVendorMerge({ ...fix.options, stagePath })
      const before = snapshot(fix)
      assert.throws(
        () => applyVendorStage({
          root: fix.hospital,
          upstreamRoot: fix.upstreamRoot,
          stagePath,
          faultInjector(actual) {
            if (actual === point) throw new Error(`injected ${point}`)
          },
        }),
        new RegExp(`injected ${point}`),
      )
      assertUnchanged(fix, before)
      const leftovers = readdirSync(join(fix.hospital, "apps"))
        .filter(name => name.startsWith(".lospor-vendor-"))
      assert.deepEqual(leftovers, [])
    })
  }
})
