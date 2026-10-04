#!/usr/bin/env node
// Vendor every upstream release in one command (1.5.0).
//
//   node scripts/release-vendor.mjs core=9.14.0 api=9.14.0 web=9.14.0 pwa=9.14.0 [browser=X.Y.Z] [--check]
//
// For each source, in dependency order (core, api, web, pwa, browser), runs the
// vendor engine's stage. A clean merge is applied by the engine as always. A
// conflicted merge is resolved only by the rules in vendor-conflict-rules.mjs
// (package identity, changelog, lockfile, generated OpenAPI); if any conflicted
// file falls outside them, nothing is changed and the files are listed for a
// human. Every source is checked before the first one is touched.
//
// Then: one commit per source naming each rule it applied, plain npm install
// where lockfiles must follow (the appliance links Core from vendor/), the
// OpenAPI regenerated if a rule asked for it, stamp-upstream for every source,
// and verify:upstream plus verify:hospital-overlays.
//
// --check reports what would happen and changes nothing.
//
// Never fetches, pushes or edits an upstream clone; reads local clones under
// LOSPOR_UPSTREAM_ROOT (default ../LOSPOR), as vendor-upstream.mjs does.

import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { SOURCES, VendorError, applyVendorStage, checkVendorMerge, stageVendorMerge } from "./vendor-upstream-engine.mjs"
import { resolveConflict } from "./vendor-conflict-rules.mjs"

export const ORDER = ["core", "api", "web", "pwa", "browser"]
const MARKER = /^(<<<<<<<|\|\|\|\|\|\|\||=======|>>>>>>>)( |$)/m

export class ReleaseVendorError extends Error {}
const refuse = message => { throw new ReleaseVendorError(message) }

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] }).trim()
}

/** A file at a commit, or null when it does not exist there. */
function show(repository, commit, path) {
  try {
    return execFileSync("git", ["show", `${commit}:${path}`], { cwd: repository, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return null
  }
}

export function parseTargets(args) {
  const targets = new Map()
  for (const arg of args) {
    const match = /^([a-z]+)=(\d+\.\d+\.\d+)$/.exec(arg) ?? refuse(`'${arg}' is not source=X.Y.Z`)
    if (!SOURCES[match[1]]) refuse(`Unknown source '${match[1]}'. Sources: ${ORDER.join(", ")}`)
    if (targets.has(match[1])) refuse(`${match[1]} is named twice`)
    targets.set(match[1], match[2])
  }
  if (targets.size === 0) refuse("Name at least one source=X.Y.Z")
  return ORDER.filter(name => targets.has(name)).map(name => ({ source: name, version: targets.get(name) }))
}

/** How each conflicted file of one engine report would be resolved, from the three real versions. */
export function resolutionsFor(root, upstreamRoot, report) {
  const upstreamRepo = join(upstreamRoot, SOURCES[report.source].repo)
  return report.conflicts.map(path => ({
    path,
    resolution: resolveConflict(path, {
      base: show(upstreamRepo, report.base.commit, path),
      ours: show(root, "HEAD", `${report.sourcePath}/${path}`),
      theirs: show(upstreamRepo, report.theirs.commit, path),
    }),
  }))
}

/** Make the tracked files under `sourcePath` exactly the stage result; ignored files (node_modules) stay. */
function syncTracked(root, sourcePath, resultPath) {
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)])
  const files = new Set(walk(resultPath).map(file => relative(resultPath, file).split(sep).join("/")))
  const tracked = git(root, "ls-files", "-z", "--", sourcePath).split("\0").filter(Boolean).map(file => file.slice(sourcePath.length + 1))
  for (const file of tracked) if (!files.has(file)) rmSync(join(root, sourcePath, file))
  for (const file of files) {
    const to = join(root, sourcePath, file)
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, readFileSync(join(resultPath, file)))
  }
}

function commit(root, paths, message) {
  git(root, "add", "-A", "--", ...paths)
  if (git(root, "diff", "--cached", "--name-only") === "") return false
  const file = join(root, ".data", "release-vendor", `message-${process.pid}.txt`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, message)
  try {
    git(root, "commit", "--quiet", "-F", file)
  } finally {
    rmSync(file, { force: true })
  }
  return true
}

function defaultRun(command, args, cwd) {
  // npm is a .cmd on Windows and needs the shell; node must not go through it,
  // because its path (C:\Program Files\...) has a space in it.
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" && command === "npm" })
  if (result.status !== 0) refuse(`${command} ${args.join(" ")} failed in ${cwd}`)
}

/** Apps whose lockfile records the vendored Core link, and so must follow a Core import. */
function appsLinkingCore(root) {
  return Object.values(SOURCES).map(source => source.path).filter(path => {
    const manifest = join(root, path, "package.json")
    return existsSync(manifest) && readFileSync(manifest, "utf8").includes("file:../../vendor/lospor-core")
  })
}

/** Vendored paths among the targets whose committed tree no longer matches their pin. */
export function pinnedTreeMismatches(root, targets) {
  const { sources } = JSON.parse(readFileSync(join(root, "UPSTREAM_VERSIONS.json"), "utf8"))
  return targets.map(target => SOURCES[target.source].path).filter(path => {
    const pin = Object.values(sources).find(source => source?.path === path)
    return pin && git(root, "rev-parse", `HEAD:${path}`) !== pin.treeOid
  })
}

export function releaseVendor({ root, upstreamRoot, targets, check = false, say = console.log, run = defaultRun }) {
  if (git(root, "status", "--porcelain", "--untracked-files=no") !== "") refuse("Commit or stash tracked changes first: vendoring commits as it goes.")

  // A committed Hospital edit inside a vendored path moves its tree away from
  // the pin, and the engine refuses to merge onto an unpinned tree. Stamping
  // first records what is really committed, as it always had to be by hand.
  const moved = pinnedTreeMismatches(root, targets)
  if (moved.length > 0) {
    if (check) refuse(`${moved.join(", ")} changed since the last stamp. Without --check this stamps and commits first; or run node scripts/stamp-upstream.mjs and commit UPSTREAM_VERSIONS.json.`)
    run(process.execPath, [join(root, "scripts", "stamp-upstream.mjs")], root)
    commit(root, ["UPSTREAM_VERSIONS.json"], `Stamp Hospital edits in ${moved.join(", ")} before vendoring\n`)
    say(`Stamped Hospital edits in ${moved.join(", ")} first.`)
  }

  // Everything is checked before anything is touched.
  const plans = targets.map(target => {
    const report = checkVendorMerge({ root, upstreamRoot, sourceName: target.source, targetVersion: target.version })
    return { ...target, report, resolutions: resolutionsFor(root, upstreamRoot, report) }
  })
  const unresolved = plans.flatMap(plan => plan.resolutions.filter(entry => !entry.resolution).map(entry => `${plan.report.sourcePath}/${entry.path}`))
  for (const plan of plans) {
    say(`${plan.source} ${plan.report.base.version} -> ${plan.version}: ${plan.report.upstreamChanges.length} upstream file(s) changed, ${plan.report.conflicts.length} conflict(s)`)
    for (const entry of plan.resolutions) say(`  ${entry.path}: ${entry.resolution ? entry.resolution.rule : "NEEDS A HUMAN"}`)
  }
  if (unresolved.length > 0) {
    refuse(`These conflicts are outside the vendoring rules; resolve them by hand (vendor-upstream.mjs --stage), then rerun:\n  ${unresolved.join("\n  ")}`)
  }
  if (check) return { applied: false, plans }

  const followUps = new Set()
  const stageRoot = join(root, ".data", "release-vendor")
  mkdirSync(stageRoot, { recursive: true })
  for (const plan of plans) {
    const sourcePath = SOURCES[plan.source].path
    const stagePath = join(stageRoot, `${plan.source}-${plan.version}-${Date.now()}`)
    const stage = stageVendorMerge({ root, upstreamRoot, sourceName: plan.source, targetVersion: plan.version, stagePath })
    const notes = []
    if (stage.status === "clean") {
      applyVendorStage({ root, upstreamRoot, stagePath })
    } else {
      // Recomputed against the stage itself, so the commits are the ones it merged.
      for (const { path, resolution } of resolutionsFor(root, upstreamRoot, stage)) {
        if (!resolution) refuse(`${sourcePath}/${path} changed between check and stage; nothing for it was applied.`)
        writeFileSync(join(stagePath, "result", path), resolution.text)
        notes.push(...resolution.notes.map(note => `${path} (${resolution.rule}): ${note}`))
        if (resolution.followUp) followUps.add(`${resolution.followUp}:${sourcePath}`)
      }
      for (const path of stage.conflicts) {
        if (MARKER.test(readFileSync(join(stagePath, "result", path), "utf8"))) refuse(`${sourcePath}/${path} still holds conflict markers.`)
      }
      syncTracked(root, sourcePath, join(stagePath, "result"))
    }
    rmSync(stagePath, { recursive: true, force: true })
    const message = [
      `Vendor ${plan.source} ${plan.version}`,
      "",
      `Upstream ${SOURCES[plan.source].repo} ${stage.base.version} -> ${plan.version} (${stage.theirs.commit}).`,
      stage.status === "clean"
        ? "Clean merge, applied by the vendor engine."
        : "Conflicts resolved by the release:vendor rules (scripts/vendor-conflict-rules.mjs), not by the engine:",
      ...notes.map(note => `- ${note}`),
      "",
    ].join("\n")
    commit(root, [sourcePath], message)
    say(`Committed ${plan.source} ${plan.version}.`)
    followUps.add(`npm-install:${sourcePath}`)
    if (plan.source === "core") for (const path of appsLinkingCore(root)) followUps.add(`npm-install:${path}`)
  }

  // Lockfiles follow the merged package.json and the vendored Core; plain
  // npm install keeps the link form verify-upstream reads.
  const refreshed = []
  for (const followUp of [...followUps].sort()) {
    const [kind, path] = followUp.split(/:(.+)/)
    if (kind === "npm-install") { run("npm", ["install"], join(root, path)); refreshed.push(path) }
  }
  for (const followUp of followUps) {
    const [kind, path] = followUp.split(/:(.+)/)
    if (kind === "openapi-generate") { run("npm", ["run", "openapi:generate"], join(root, path)); refreshed.push(path) }
  }
  if (refreshed.length > 0 && commit(root, [...new Set(refreshed)], "Refresh lockfiles and generated files after vendoring\n")) say("Committed refreshed lockfiles.")

  for (const plan of plans) run(process.execPath, [join(root, "scripts", "stamp-upstream.mjs"), plan.source, plan.version], root)
  commit(root, ["UPSTREAM_VERSIONS.json"], `Stamp ${plans.map(plan => `${plan.source} ${plan.version}`).join(", ")}\n`)
  run("npm", ["run", "verify:upstream"], root)
  run("npm", ["run", "verify:hospital-overlays"], root)
  say("Vendored, stamped and verified. Next: npm run release:version -- <X.Y.Z> --justification \"...\"")
  return { applied: true, plans }
}

function main() {
  const root = fileURLToPath(new URL("..", import.meta.url))
  const args = process.argv.slice(2)
  const check = args.includes("--check")
  try {
    const targets = parseTargets(args.filter(arg => arg !== "--check"))
    releaseVendor({ root, upstreamRoot: process.env.LOSPOR_UPSTREAM_ROOT ?? join(root, "..", "LOSPOR"), targets, check })
  } catch (error) {
    if (error instanceof ReleaseVendorError || error instanceof VendorError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
