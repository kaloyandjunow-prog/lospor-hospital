#!/usr/bin/env node
// Release the upstream train in one approved run (1.5.0).
//
//   node scripts/upstream-train.mjs <X.Y.Z>          print the plan, change nothing
//   node scripts/upstream-train.mjs <X.Y.Z> --yes    run it
//
// Order: Core first, then Web and PWA, then API, then docs -- each repo's PR
// merged before the next starts, because Web, PWA and API pin Core's tag and
// the tag only exists once Core is merged. For each repo, on its current
// release branch:
//
//   1. refuse a dirty tree, a branch that is main, a package version that is
//      not X.Y.Z, or a CHANGELOG without its [X.Y.Z] entry;
//   2. (Web, PWA, API) pin @lospor/core to vX.Y.Z at the exact merged commit,
//      in package.json and package-lock.json, and commit that;
//   3. push the branch and open its PR (or reuse the open one);
//   4. wait for CI, then squash-merge; where main is protected (API, docs)
//      ask for the merge in the browser and wait for it;
//   5. tag the squash commit on main as vX.Y.Z and push the tag. Tags are made
//      after merging, never on the branch: squash creates a new commit.
//
// Reads LOSPOR_UPSTREAM_ROOT (default ../LOSPOR). Every step re-reads GitHub,
// so a run stopped halfway resumes: a merged PR is not merged again, an
// existing tag on the right commit is kept, and a tag on another commit stops.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath, pathToFileURL } from "node:url"

export const OWNER = "kaloyandjunow-prog"
export const TRAIN = Object.freeze([
  { repo: "lospor-core", pinsCore: false, protectedMain: false },
  { repo: "lospor-app", pinsCore: true, protectedMain: false },
  { repo: "lospor-mobile", pinsCore: true, protectedMain: false },
  { repo: "lospor-api", pinsCore: true, protectedMain: true },
  { repo: "lospor-docs", pinsCore: false, protectedMain: true },
])
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export class TrainError extends Error {}
const refuse = message => { throw new TrainError(message) }

/** Move the Core pin in package.json and package-lock.json to `to` at `commit`. */
export function pinCore(packageText, lockText, to, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) refuse(`'${commit}' is not a full commit`)
  const pin = /(lospor-core(?:\.git)?#v)(\d+\.\d+\.\d+)/g
  if (!pin.test(packageText)) refuse("package.json has no @lospor/core tag pin")
  const pkg = packageText.replace(pin, `$1${to}`)
  const entry = /("node_modules\/@lospor\/core": \{\s*"version": )"[^"]+"(,\s*"resolved": "git\+ssh:\/\/git@github\.com\/kaloyandjunow-prog\/lospor-core\.git#)[0-9a-f]{40}"/
  if (!entry.test(lockText)) refuse("package-lock.json has no resolved @lospor/core entry")
  const lock = lockText.replace(pin, `$1${to}`).replace(entry, `$1"${to}"$2${commit}"`)
  return { pkg, lock }
}

/** The plan, as the steps a maintainer reads before approving it. */
export function plan(version) {
  return TRAIN.flatMap(({ repo, pinsCore, protectedMain }) => [
    `${repo}: check version ${version}, its changelog entry and a clean release branch`,
    ...(pinsCore ? [`${repo}: pin @lospor/core to v${version} at Core's merged commit, and commit`] : []),
    `${repo}: push the branch and open (or reuse) its PR`,
    `${repo}: wait for CI, then ${protectedMain ? "wait for you to merge it in the browser (protected main)" : "squash-merge"}`,
    `${repo}: tag the merged commit on main as v${version} and push the tag`,
  ])
}

export async function runTrain({ version, root, exec, say, poll = 30_000, maxWait = 6 * 3_600_000, read = readFileSync, write = writeFileSync, exists = existsSync }) {
  if (!VERSION.test(version)) refuse(`'${version}' is not X.Y.Z`)
  const git = (repo, ...args) => exec("git", args, join(root, repo)).trim()
  const gh = (repo, ...args) => exec("gh", [...args, "--repo", `${OWNER}/${repo}`], join(root, repo)).trim()
  let coreCommit = null

  for (const { repo, pinsCore, protectedMain } of TRAIN) {
    const dir = join(root, repo)
    if (!exists(dir)) refuse(`${repo} is not cloned under ${root}`)
    const tag = `v${version}`
    const existingTag = git(repo, "ls-remote", "--tags", "origin", `refs/tags/${tag}`)
    if (existingTag) {
      say(`${repo}: ${tag} is already released; skipping.`)
      if (repo === "lospor-core") coreCommit = git(repo, "ls-remote", "origin", `refs/tags/${tag}^{}`).split(/\s/)[0] || existingTag.split(/\s/)[0]
      continue
    }

    const branch = git(repo, "branch", "--show-current")
    if (!branch || branch === "main") refuse(`${repo} must be on its release branch, not '${branch || "detached"}'`)
    if (git(repo, "status", "--porcelain", "--untracked-files=no")) refuse(`${repo} has uncommitted changes`)
    const pkg = JSON.parse(read(join(dir, "package.json"), "utf8"))
    if (pkg.version !== version) refuse(`${repo} package.json is ${pkg.version}, not ${version}`)
    if (!read(join(dir, "CHANGELOG.md"), "utf8").includes(`## [${version}]`)) refuse(`${repo} CHANGELOG.md has no [${version}] entry`)

    if (pinsCore) {
      if (!coreCommit) refuse(`${repo} needs Core ${tag}, which is not released yet`)
      const pinned = pinCore(read(join(dir, "package.json"), "utf8"), read(join(dir, "package-lock.json"), "utf8"), version, coreCommit)
      write(join(dir, "package.json"), pinned.pkg)
      write(join(dir, "package-lock.json"), pinned.lock)
      if (git(repo, "status", "--porcelain", "--untracked-files=no")) {
        git(repo, "add", "package.json", "package-lock.json")
        git(repo, "commit", "--quiet", "-m", `Core dependency moved to ${version}`)
        say(`${repo}: pinned Core ${tag} at ${coreCommit}.`)
      }
    }

    git(repo, "push", "--quiet", "-u", "origin", branch)
    let number = gh(repo, "pr", "list", "--head", branch, "--state", "all", "--json", "number,state", "--jq", "map(select(.state != \"CLOSED\")) | .[0].number // empty")
    if (!number) {
      gh(repo, "pr", "create", "--base", "main", "--head", branch, "--title", `${version}`, "--body", `Release ${version}. See CHANGELOG.md.`)
      number = gh(repo, "pr", "list", "--head", branch, "--json", "number", "--jq", ".[0].number")
    }
    say(`${repo}: PR #${number}.`)

    let state = gh(repo, "pr", "view", number, "--json", "state", "--jq", ".state")
    if (state !== "MERGED") {
      say(`${repo}: waiting for CI on #${number}...`)
      exec("gh", ["pr", "checks", number, "--watch", "--fail-fast", "--repo", `${OWNER}/${repo}`], dir)
      if (protectedMain) {
        say(`${repo}: main is protected. Merge #${number} in the browser (squash): https://github.com/${OWNER}/${repo}/pull/${number}`)
      } else {
        gh(repo, "pr", "merge", number, "--squash", "--delete-branch=false")
      }
      const deadline = Date.now() + maxWait
      for (;;) {
        state = gh(repo, "pr", "view", number, "--json", "state", "--jq", ".state")
        if (state === "MERGED") break
        if (state === "CLOSED") refuse(`${repo} #${number} was closed without merging`)
        if (Date.now() > deadline) refuse(`${repo} #${number} was not merged within ${Math.round(maxWait / 60_000)} minutes; run again to resume`)
        await sleep(poll)
      }
    }

    const merged = gh(repo, "pr", "view", number, "--json", "mergeCommit", "--jq", ".mergeCommit.oid")
    if (!/^[a-f0-9]{40}$/.test(merged)) refuse(`${repo} #${number} has no merge commit`)
    git(repo, "fetch", "--quiet", "origin", "main", "--tags")
    git(repo, "tag", "-a", tag, merged, "-m", `${repo} ${version}`)
    git(repo, "push", "--quiet", "origin", `refs/tags/${tag}`)
    say(`${repo}: released ${tag} at ${merged}.`)
    if (repo === "lospor-core") coreCommit = merged
  }
  return { coreCommit }
}

function realExec(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "inherit"] })
}

async function main() {
  const [version, ...flags] = process.argv.slice(2)
  const root = process.env.LOSPOR_UPSTREAM_ROOT ?? join(fileURLToPath(new URL("..", import.meta.url)), "..", "LOSPOR")
  if (!version || flags.some(flag => flag !== "--yes")) {
    console.error("Usage: node scripts/upstream-train.mjs <X.Y.Z> [--yes]")
    process.exit(2)
  }
  if (!flags.includes("--yes")) {
    console.log(`The ${version} train (nothing is changed without --yes):`)
    for (const step of plan(version)) console.log(`  ${step}`)
    return
  }
  try {
    await runTrain({ version, root, exec: realExec, say: line => console.log(line) })
    console.log(`Upstream ${version} released. Next: npm run release:vendor -- core=${version} api=${version} web=${version} pwa=${version}`)
  } catch (error) {
    if (!(error instanceof TrainError)) throw error
    console.error(error.message)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
