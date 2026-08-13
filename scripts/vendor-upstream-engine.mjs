import { execFileSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path"
import { tmpdir } from "node:os"

export const VENDOR_STAGE_SCHEMA = 1

export const SOURCES = Object.freeze({
  api: Object.freeze({ repo: "lospor-api", path: "apps/api" }),
  web: Object.freeze({ repo: "lospor-app", path: "apps/web" }),
  pwa: Object.freeze({ repo: "lospor-mobile", path: "apps/pwa" }),
  browser: Object.freeze({ repo: "lospor-browser", path: "apps/browser" }),
  core: Object.freeze({ repo: "lospor-core", path: "vendor/lospor-core" }),
})

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const OBJECT_ID = /^[0-9a-f]{40,64}$/

export class VendorError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = "VendorError"
    this.code = code
    this.details = details
  }
}

function command(cwd, args, options = {}) {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    maxBuffer: 1 << 28,
    windowsHide: true,
    stdio: options.stdio ?? ["pipe", "pipe", "pipe"],
  })
}

function git(cwd, ...args) {
  return command(cwd, ["git", ...args]).trim()
}

function gitResult(cwd, ...args) {
  try {
    return { ok: true, output: git(cwd, ...args) }
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`.trim(),
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function readManifest(root) {
  const path = join(root, "UPSTREAM_VERSIONS.json")
  let bytes
  let parsed
  try {
    bytes = readFileSync(path)
    parsed = JSON.parse(bytes.toString("utf8"))
  } catch (error) {
    throw new VendorError("INVALID_MANIFEST", `Cannot read ${path}: ${error.message}`)
  }
  return { path, bytes, hash: sha256(bytes), parsed }
}

function ensureRepository(path, label) {
  if (!existsSync(path)) {
    throw new VendorError("MISSING_REPOSITORY", `${label} does not exist: ${path}`)
  }
  const inside = gitResult(path, "rev-parse", "--is-inside-work-tree")
  if (!inside.ok || inside.output !== "true") {
    throw new VendorError("INVALID_REPOSITORY", `${label} is not a Git worktree: ${path}`)
  }
}

function versionParts(value, label) {
  const match = VERSION.exec(value)
  if (!match) {
    throw new VendorError(
      "INVALID_VERSION",
      `${label} '${value}' is not a stable X.Y.Z version`,
    )
  }
  return match.slice(1).map(part => BigInt(part))
}

export function compareVersions(left, right) {
  const a = versionParts(left, "Version")
  const b = versionParts(right, "Version")
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1
    if (a[index] > b[index]) return 1
  }
  return 0
}

function sourceDefinition(sourceName) {
  const source = SOURCES[sourceName]
  if (!source) {
    throw new VendorError(
      "UNKNOWN_SOURCE",
      `Unknown source '${sourceName}'. Known sources: ${Object.keys(SOURCES).join(", ")}`,
    )
  }
  return source
}

function assertSafeSourcePath(root, sourcePath) {
  const absolute = resolve(root, sourcePath)
  const rel = relative(root, absolute)
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new VendorError("UNSAFE_SOURCE_PATH", `Unsafe vendored path '${sourcePath}'`)
  }
  const target = lstatSync(absolute, { throwIfNoEntry: false })
  if (!target?.isDirectory() || target.isSymbolicLink()) {
    throw new VendorError(
      "INVALID_TARGET",
      `Vendored target must be a real directory: ${absolute}`,
    )
  }
  if (existsSync(join(absolute, ".git"))) {
    throw new VendorError(
      "NESTED_REPOSITORY",
      `Vendored target must not contain a nested .git repository: ${absolute}`,
    )
  }
  return absolute
}

function resolveExactTag(upstreamRepo, targetVersion) {
  versionParts(targetVersion, "Target version")
  const tag = `v${targetVersion}`
  const ref = `refs/tags/${tag}`
  const exact = gitResult(upstreamRepo, "show-ref", "--verify", "--hash", ref)
  if (!exact.ok || !OBJECT_ID.test(exact.output)) {
    throw new VendorError(
      "MISSING_STABLE_TAG",
      `Existing upstream clone has no exact stable tag ${tag}`,
    )
  }
  const commit = gitResult(upstreamRepo, "rev-parse", `${ref}^{commit}`)
  if (!commit.ok || !OBJECT_ID.test(commit.output)) {
    throw new VendorError("INVALID_TAG", `${tag} does not resolve to a commit`)
  }
  return { tag, ref, commit: commit.output }
}

function resolvePinnedCommit(upstreamRepo, pinned) {
  if (!OBJECT_ID.test(pinned.commit ?? "")) {
    throw new VendorError("INVALID_PIN", "Pinned source has no valid commit object ID")
  }
  const resolved = gitResult(upstreamRepo, "rev-parse", `${pinned.commit}^{commit}`)
  if (!resolved.ok || resolved.output !== pinned.commit) {
    throw new VendorError(
      "MISSING_PINNED_COMMIT",
      `Pinned commit ${pinned.commit} is not present in the existing upstream clone`,
    )
  }
  return resolved.output
}

function assertPinnedVersionTag(upstreamRepo, pinned) {
  const tagged = resolveExactTag(upstreamRepo, pinned.version)
  if (tagged.commit !== pinned.commit) {
    throw new VendorError(
      "PIN_VERSION_MISMATCH",
      `Pinned version ${pinned.version} resolves to ${tagged.commit}, not manifest commit ${pinned.commit}`,
    )
  }
}

function assertCleanTarget(root, sourcePath) {
  const dirty = git(root, "status", "--porcelain=v1", "--untracked-files=all", "--", sourcePath)
  if (dirty) {
    throw new VendorError(
      "DIRTY_TARGET",
      `${sourcePath} has tracked or untracked changes`,
      { status: dirty.split(/\r?\n/) },
    )
  }
}

function assertPinnedTree(root, sourcePath, pinned) {
  if (!OBJECT_ID.test(pinned.treeOid ?? "")) {
    throw new VendorError("INVALID_PIN", `${sourcePath} has no valid pinned treeOid`)
  }
  const actual = gitResult(root, "rev-parse", `HEAD:${sourcePath}`)
  if (!actual.ok) {
    throw new VendorError("MISSING_TARGET_TREE", `${sourcePath} is not present in HEAD`)
  }
  if (actual.output !== pinned.treeOid) {
    throw new VendorError(
      "PINNED_TREE_MISMATCH",
      `${sourcePath} at HEAD is ${actual.output}, but the manifest pins ${pinned.treeOid}`,
    )
  }
  return actual.output
}

function assertTargetDescendsFromBase(upstreamRepo, baseCommit, targetCommit) {
  const result = gitResult(upstreamRepo, "merge-base", "--is-ancestor", baseCommit, targetCommit)
  if (!result.ok) {
    throw new VendorError(
      "DIVERGED_TARGET",
      `Target commit ${targetCommit} does not descend from pinned commit ${baseCommit}`,
    )
  }
}

function gitObjectDirectory(repository) {
  const common = git(repository, "rev-parse", "--git-common-dir")
  return realpathSync(resolve(repository, common, "objects"))
}

function configureAlternates(repository, sourceRepositories) {
  const objectDirectory = resolve(repository, git(repository, "rev-parse", "--git-path", "objects"))
  const info = join(objectDirectory, "info")
  mkdirSync(info, { recursive: true })
  const alternates = [...new Set(sourceRepositories.map(gitObjectDirectory))]
    .map(path => path.split(sep).join("/"))
  writeFileSync(join(info, "alternates"), `${alternates.join("\n")}\n`, "utf8")
}

function commitFromTree(repository, tree, parent, message) {
  return git(
    repository,
    "-c", "user.email=vendor@lospor.local",
    "-c", "user.name=LOSPOR vendor guard",
    "commit-tree", tree,
    ...(parent ? ["-p", parent] : []),
    "-m", message,
  )
}

function nulPaths(repository, ...args) {
  const output = command(repository, ["git", ...args, "-z"], { encoding: null })
  return output.toString("utf8").split("\0").filter(Boolean)
}

function copyTreeContents(source, destination, { exclude = [] } = {}) {
  mkdirSync(destination, { recursive: false })
  for (const name of readdirSync(source)) {
    if (exclude.includes(name)) continue
    cpSync(join(source, name), join(destination, name), {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    })
  }
}

function walkFiles(root, directory = root, output = []) {
  for (const name of readdirSync(directory).sort((a, b) => a.localeCompare(b, "en"))) {
    const absolute = join(directory, name)
    const rel = relative(root, absolute).split(sep).join("/")
    const stat = lstatSync(absolute)
    if (stat.isDirectory()) {
      walkFiles(root, absolute, output)
    } else if (stat.isFile() || stat.isSymbolicLink()) {
      output.push({ absolute, rel, stat })
    } else {
      throw new VendorError("UNSUPPORTED_FILE", `Unsupported staged file type: ${rel}`)
    }
  }
  return output
}

export function hashDirectory(root) {
  const hash = createHash("sha256")
  for (const entry of walkFiles(root)) {
    const type = entry.stat.isSymbolicLink() ? "link" : "file"
    const executable = entry.stat.mode & 0o111 ? "x" : "-"
    const bytes = type === "link"
      ? Buffer.from(readlinkSync(entry.absolute), "utf8")
      : readFileSync(entry.absolute)
    const contentHash = sha256(bytes)
    hash.update(`${type}\0${entry.rel}\0${executable}\0${bytes.length}\0${contentHash}\0`)
  }
  return hash.digest("hex")
}

function treeOidForDirectory(directory) {
  const temporary = mkdtempSync(join(tmpdir(), "lospor-vendor-tree-"))
  try {
    git(temporary, "init", "--quiet")
    git(temporary, "config", "core.autocrlf", "false")
    git(temporary, "config", "core.eol", "lf")
    git(temporary, "config", "core.filemode", "true")
    copyTreeContents(directory, join(temporary, "content"))
    git(temporary, "--work-tree", join(temporary, "content"), "add", "-A")
    return git(temporary, "write-tree")
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function buildMerge(preflight) {
  const temporary = mkdtempSync(join(tmpdir(), `lospor-vendor-${preflight.sourceName}-`))
  const work = join(temporary, "merge")
  mkdirSync(work)
  try {
    git(work, "init", "--quiet")
    git(work, "config", "merge.conflictStyle", "diff3")
    git(work, "config", "core.quotepath", "false")
    git(work, "config", "core.autocrlf", "false")
    git(work, "config", "core.eol", "lf")
    git(work, "config", "commit.gpgSign", "false")
    git(work, "config", "rerere.enabled", "false")
    const emptyHooks = join(work, ".git", "disabled-hooks")
    mkdirSync(emptyHooks)
    git(work, "config", "core.hooksPath", emptyHooks)
    configureAlternates(work, [preflight.upstreamRepo, preflight.root])

    const baseTree = preflight.baseTree
    const oursTree = preflight.oursTree
    const theirsTree = preflight.theirsTree
    const baseSyntheticCommit = commitFromTree(
      work,
      baseTree,
      null,
      `upstream ${preflight.pinned.version}`,
    )
    const oursSyntheticCommit = commitFromTree(
      work,
      oursTree,
      baseSyntheticCommit,
      `appliance ${preflight.pinned.version}`,
    )
    const theirsSyntheticCommit = commitFromTree(
      work,
      theirsTree,
      baseSyntheticCommit,
      `upstream ${preflight.targetVersion}`,
    )
    git(work, "update-ref", "refs/heads/appliance", oursSyntheticCommit)
    git(work, "update-ref", "refs/heads/upstream", theirsSyntheticCommit)
    git(work, "checkout", "--quiet", "appliance")

    const upstreamChanges = nulPaths(
      work,
      "diff", "--name-only", baseSyntheticCommit, theirsSyntheticCommit,
    )
    const merge = gitResult(
      work,
      "-c", "user.email=vendor@lospor.local",
      "-c", "user.name=LOSPOR vendor guard",
      "-c", "commit.gpgSign=false",
      "merge", "--no-edit", "upstream",
    )
    const conflicts = nulPaths(work, "diff", "--name-only", "--diff-filter=U")
    if (!merge.ok && conflicts.length === 0) {
      throw new VendorError("MERGE_FAILED", merge.output || "Git merge failed")
    }

    const result = join(temporary, "result")
    copyTreeContents(work, result, { exclude: [".git"] })
    const resultSha256 = hashDirectory(result)
    const resultTree = conflicts.length === 0
      ? git(work, "rev-parse", "HEAD^{tree}")
      : null
    const resultChanges = conflicts.length === 0
      ? nulPaths(work, "diff", "--name-only", oursSyntheticCommit, "HEAD")
      : []

    return {
      temporary,
      result,
      status: conflicts.length ? "conflicts" : "clean",
      conflicts,
      upstreamChanges,
      resultChanges,
      hashes: {
        baseTree,
        oursTree,
        theirsTree,
        resultTree,
        resultSha256,
      },
    }
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

function preflight({ root, upstreamRoot, sourceName, targetVersion }) {
  root = realpathSync(resolve(root))
  upstreamRoot = realpathSync(resolve(upstreamRoot))
  ensureRepository(root, "Hospital repository")
  const source = sourceDefinition(sourceName)
  const targetPath = assertSafeSourcePath(root, source.path)
  const manifest = readManifest(root)
  const pinned = manifest.parsed?.sources?.[sourceName]
  if (!pinned || pinned.path !== source.path) {
    throw new VendorError(
      "INVALID_PIN",
      `Manifest source '${sourceName}' must pin path '${source.path}'`,
    )
  }
  versionParts(pinned.version, "Pinned version")
  if (compareVersions(targetVersion, pinned.version) <= 0) {
    throw new VendorError(
      "NON_FORWARD_VERSION",
      `Target ${targetVersion} must be newer than pinned ${pinned.version}`,
    )
  }
  assertCleanTarget(root, source.path)
  const hospitalHead = git(root, "rev-parse", "HEAD^{commit}")
  const oursTree = assertPinnedTree(root, source.path, pinned)
  const upstreamRepo = join(upstreamRoot, source.repo)
  ensureRepository(upstreamRepo, `Upstream clone for ${sourceName}`)
  const upstreamHead = git(upstreamRepo, "rev-parse", "HEAD^{commit}")
  const baseCommit = resolvePinnedCommit(upstreamRepo, pinned)
  assertPinnedVersionTag(upstreamRepo, pinned)
  const target = resolveExactTag(upstreamRepo, targetVersion)
  assertTargetDescendsFromBase(upstreamRepo, baseCommit, target.commit)
  const baseTree = git(upstreamRepo, "rev-parse", `${baseCommit}^{tree}`)
  const theirsTree = git(upstreamRepo, "rev-parse", `${target.commit}^{tree}`)

  return {
    root,
    upstreamRoot,
    upstreamRepo,
    upstreamHead,
    sourceName,
    source,
    targetPath,
    targetVersion,
    target,
    pinned: {
      version: pinned.version,
      commit: baseCommit,
      treeOid: pinned.treeOid,
      path: pinned.path,
    },
    manifestHash: manifest.hash,
    hospitalHead,
    oursTree,
    baseTree,
    theirsTree,
  }
}

function assertUpstreamUnchanged(context) {
  const actual = git(context.upstreamRepo, "rev-parse", "HEAD^{commit}")
  if (actual !== context.upstreamHead) {
    throw new VendorError(
      "UPSTREAM_CHANGED",
      `Upstream clone HEAD changed during the operation (${context.upstreamHead} -> ${actual})`,
    )
  }
}

function reportFrom(context, merge, mode) {
  return {
    schemaVersion: VENDOR_STAGE_SCHEMA,
    mode,
    status: merge.status,
    source: context.sourceName,
    sourcePath: context.source.path,
    targetVersion: context.targetVersion,
    targetTag: context.target.tag,
    conflicts: merge.conflicts,
    upstreamChanges: merge.upstreamChanges,
    resultChanges: merge.resultChanges,
    hospital: {
      root: context.root,
      head: context.hospitalHead,
      manifestSha256: context.manifestHash,
    },
    base: {
      version: context.pinned.version,
      commit: context.pinned.commit,
      treeOid: context.baseTree,
      manifestTreeOid: context.pinned.treeOid,
    },
    ours: {
      head: context.hospitalHead,
      treeOid: context.oursTree,
    },
    theirs: {
      version: context.targetVersion,
      tag: context.target.tag,
      commit: context.target.commit,
      treeOid: context.theirsTree,
    },
    result: {
      treeOid: merge.hashes.resultTree,
      sha256: merge.hashes.resultSha256,
    },
  }
}

export function checkVendorMerge(options) {
  const context = preflight(options)
  let merge
  try {
    merge = buildMerge(context)
    return reportFrom(context, merge, "check")
  } finally {
    if (merge) rmSync(merge.temporary, { recursive: true, force: true })
    assertUpstreamUnchanged(context)
  }
}

function existingDevice(path) {
  let current = resolve(path)
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) {
      throw new VendorError("MISSING_PARENT", `No existing ancestor for ${path}`)
    }
    current = parent
  }
  return statSync(current).dev
}

function assertSameFilesystem(left, right, message) {
  if (existingDevice(left) !== existingDevice(right)) {
    throw new VendorError("CROSS_DEVICE_STAGE", message)
  }
}

export function stageVendorMerge(options) {
  if (!options.stagePath) {
    throw new VendorError("MISSING_STAGE", "--stage requires a new directory path")
  }
  const stagePath = resolve(options.stagePath)
  if (existsSync(stagePath)) {
    throw new VendorError("STAGE_EXISTS", `Refusing to overwrite existing path: ${stagePath}`)
  }
  if (!existsSync(dirname(stagePath))) {
    throw new VendorError("MISSING_STAGE_PARENT", `Stage parent does not exist: ${dirname(stagePath)}`)
  }
  const context = preflight(options)
  const stageRelativeToTarget = relative(context.targetPath, stagePath)
  if (
    stageRelativeToTarget === ""
    || (!stageRelativeToTarget.startsWith(`..${sep}`) && stageRelativeToTarget !== ".." && !isAbsolute(stageRelativeToTarget))
  ) {
    throw new VendorError("UNSAFE_STAGE_PATH", "A review stage cannot be created inside the vendored target")
  }
  assertSameFilesystem(stagePath, context.targetPath, "Stage and vendored target must share a filesystem")
  let merge
  try {
    merge = buildMerge(context)
    const report = reportFrom(context, merge, "stage")
    const metadata = {
      ...report,
      createdAt: new Date().toISOString(),
      stagePath,
    }
    mkdirSync(stagePath, { recursive: false })
    try {
      copyTreeContents(merge.result, join(stagePath, "result"))
      writeFileSync(
        join(stagePath, "metadata.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      )
    } catch (error) {
      rmSync(stagePath, { recursive: true, force: true })
      throw error
    }
    return metadata
  } finally {
    if (merge) rmSync(merge.temporary, { recursive: true, force: true })
    assertUpstreamUnchanged(context)
  }
}

function readStage(stagePath) {
  stagePath = realpathSync(resolve(stagePath))
  let metadata
  try {
    metadata = JSON.parse(readFileSync(join(stagePath, "metadata.json"), "utf8"))
  } catch (error) {
    throw new VendorError("INVALID_STAGE", `Cannot read stage metadata: ${error.message}`)
  }
  if (metadata.schemaVersion !== VENDOR_STAGE_SCHEMA || metadata.mode !== "stage") {
    throw new VendorError("INVALID_STAGE", "Unsupported stage metadata")
  }
  const resultPath = join(stagePath, "result")
  const result = lstatSync(resultPath, { throwIfNoEntry: false })
  if (!result?.isDirectory() || result.isSymbolicLink()) {
    throw new VendorError("INVALID_STAGE", "Stage result is missing or is not a real directory")
  }
  if (existsSync(join(resultPath, ".git"))) {
    throw new VendorError("INVALID_STAGE", "Stage result must not contain .git")
  }
  return { stagePath, metadata, resultPath }
}

function validateStage({ root, upstreamRoot, stagePath }) {
  root = realpathSync(resolve(root))
  upstreamRoot = realpathSync(resolve(upstreamRoot))
  ensureRepository(root, "Hospital repository")
  const stage = readStage(stagePath)
  const metadata = stage.metadata
  if (metadata.status !== "clean" || metadata.conflicts?.length) {
    throw new VendorError("UNRESOLVED_STAGE", "Only a recorded conflict-free stage can be applied")
  }
  const source = sourceDefinition(metadata.source)
  if (source.path !== metadata.sourcePath) {
    throw new VendorError("INVALID_STAGE", "Stage source path does not match its source")
  }
  const targetPath = assertSafeSourcePath(root, source.path)
  assertSameFilesystem(stage.stagePath, targetPath, "Stage and vendored target must share a filesystem")
  if (realpathSync(resolve(metadata.hospital?.root ?? "")) !== root) {
    throw new VendorError("STALE_STAGE", "Stage was created for a different Hospital repository")
  }
  assertCleanTarget(root, source.path)
  const head = git(root, "rev-parse", "HEAD^{commit}")
  if (head !== metadata.hospital.head || head !== metadata.ours.head) {
    throw new VendorError("STALE_STAGE", "Hospital HEAD changed after the stage was created")
  }
  const manifest = readManifest(root)
  if (manifest.hash !== metadata.hospital.manifestSha256) {
    throw new VendorError("STALE_STAGE", "UPSTREAM_VERSIONS.json changed after staging")
  }
  const pinned = manifest.parsed?.sources?.[metadata.source]
  if (
    pinned?.version !== metadata.base.version
    || pinned?.commit !== metadata.base.commit
    || pinned?.treeOid !== metadata.base.manifestTreeOid
    || pinned?.path !== metadata.sourcePath
  ) {
    throw new VendorError("STALE_STAGE", "The manifest pin no longer matches the stage")
  }
  const oursTree = git(root, "rev-parse", `HEAD:${source.path}`)
  if (oursTree !== metadata.ours.treeOid || oursTree !== pinned.treeOid) {
    throw new VendorError("STALE_STAGE", "The committed vendored tree no longer matches the stage")
  }
  const upstreamRepo = join(upstreamRoot, source.repo)
  ensureRepository(upstreamRepo, `Upstream clone for ${metadata.source}`)
  resolvePinnedCommit(upstreamRepo, pinned)
  assertPinnedVersionTag(upstreamRepo, pinned)
  const baseTree = git(upstreamRepo, "rev-parse", `${pinned.commit}^{tree}`)
  if (baseTree !== metadata.base.treeOid) {
    throw new VendorError("STALE_STAGE", "The pinned upstream base tree no longer matches the stage")
  }
  const target = resolveExactTag(upstreamRepo, metadata.targetVersion)
  if (target.tag !== metadata.theirs.tag || target.commit !== metadata.theirs.commit) {
    throw new VendorError("STALE_STAGE", "The target tag no longer resolves to the staged commit")
  }
  const theirsTree = git(upstreamRepo, "rev-parse", `${target.commit}^{tree}`)
  if (theirsTree !== metadata.theirs.treeOid) {
    throw new VendorError("STALE_STAGE", "The target upstream tree changed after staging")
  }
  const resultSha256 = hashDirectory(stage.resultPath)
  if (resultSha256 !== metadata.result.sha256) {
    throw new VendorError("STALE_STAGE", "The staged result changed after it was recorded")
  }
  const resultTree = treeOidForDirectory(stage.resultPath)
  if (resultTree !== metadata.result.treeOid) {
    throw new VendorError("STALE_STAGE", "The staged result Git tree no longer matches the recorded result")
  }
  return {
    ...stage,
    root,
    upstreamRoot,
    upstreamRepo,
    upstreamHead: git(upstreamRepo, "rev-parse", "HEAD^{commit}"),
    source,
    targetPath,
    manifestHash: manifest.hash,
    resultSha256,
  }
}

function uniqueSibling(parent, prefix) {
  return join(parent, `${prefix}${process.pid}-${randomBytes(8).toString("hex")}`)
}

export function applyVendorStage(options) {
  const context = validateStage(options)
  const targetBefore = hashDirectory(context.targetPath)
  const manifestBefore = sha256(readFileSync(join(context.root, "UPSTREAM_VERSIONS.json")))
  const parent = dirname(context.targetPath)
  const candidate = uniqueSibling(parent, ".lospor-vendor-candidate-")
  const backup = uniqueSibling(parent, ".lospor-vendor-rollback-")
  try {
    copyTreeContents(context.resultPath, candidate)
    if (hashDirectory(candidate) !== context.resultSha256) {
      throw new VendorError("COPY_MISMATCH", "Same-filesystem candidate does not match the stage")
    }
    assertUpstreamUnchanged(context)
    if (sha256(readFileSync(join(context.root, "UPSTREAM_VERSIONS.json"))) !== manifestBefore) {
      throw new VendorError("STALE_STAGE", "UPSTREAM_VERSIONS.json changed before promotion")
    }
  } catch (error) {
    rmSync(candidate, { recursive: true, force: true })
    throw error
  }

  let originalMoved = false
  let candidatePromoted = false
  try {
    renameSync(context.targetPath, backup)
    originalMoved = true
    options.faultInjector?.("after-backup")
    renameSync(candidate, context.targetPath)
    candidatePromoted = true
    options.faultInjector?.("after-promote")
    if (hashDirectory(context.targetPath) !== context.resultSha256) {
      throw new VendorError("APPLY_MISMATCH", "Applied target does not match the staged result")
    }
    assertUpstreamUnchanged(context)
    if (sha256(readFileSync(join(context.root, "UPSTREAM_VERSIONS.json"))) !== manifestBefore) {
      throw new VendorError("MANIFEST_CHANGED", "UPSTREAM_VERSIONS.json changed during apply")
    }
  } catch (error) {
    try {
      if (candidatePromoted && existsSync(context.targetPath)) {
        renameSync(context.targetPath, candidate)
        candidatePromoted = false
      }
      if (originalMoved && existsSync(backup) && !existsSync(context.targetPath)) {
        renameSync(backup, context.targetPath)
        originalMoved = false
      }
      rmSync(candidate, { recursive: true, force: true })
    } catch (rollbackError) {
      throw new VendorError(
        "ROLLBACK_FAILED",
        `Apply failed (${error.message}) and rollback failed (${rollbackError.message}). Original backup: ${backup}`,
      )
    }
    const manifestAfter = sha256(readFileSync(join(context.root, "UPSTREAM_VERSIONS.json")))
    if (manifestAfter !== manifestBefore || hashDirectory(context.targetPath) !== targetBefore) {
      throw new VendorError("ROLLBACK_MISMATCH", "Failed apply did not restore source and manifest")
    }
    throw error
  }

  let retainedBackup = null
  try {
    rmSync(backup, { recursive: true, force: true })
    originalMoved = false
  } catch {
    retainedBackup = backup
  }
  return {
    schemaVersion: VENDOR_STAGE_SCHEMA,
    mode: "apply",
    status: "applied",
    source: context.metadata.source,
    sourcePath: context.metadata.sourcePath,
    targetVersion: context.metadata.targetVersion,
    result: context.metadata.result,
    stagePath: context.stagePath,
    retainedBackup,
  }
}

export function writeJsonReport(path, report) {
  const absolute = resolve(path)
  if (!existsSync(dirname(absolute))) {
    throw new VendorError("MISSING_REPORT_PARENT", `Report parent does not exist: ${dirname(absolute)}`)
  }
  try {
    writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    })
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new VendorError("REPORT_EXISTS", `Refusing to overwrite existing report: ${absolute}`)
    }
    throw error
  }
  return absolute
}
