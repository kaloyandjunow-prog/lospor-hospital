#!/usr/bin/env node
// Reuse an image the last release already published when nothing that goes
// into it has changed (1.5.0).
//
// A 50-line API fix used to rebuild all ten images, PostgreSQL compiled from
// source included. Each image now carries a fingerprint of its build inputs
// as a label; when the fingerprint computed for this commit equals the label
// on the image the previous release published, the candidate takes that exact
// image instead of rebuilding it. Everything after the build still applies to
// it unchanged: it is scanned against today's vulnerability database, recorded
// in the ledger, bound in the SBOM evidence, tested, and locked by digest.
//
// The fingerprint covers what the build reads: the Dockerfile, the target
// stage, every build argument (approved base image digests, the PostgreSQL
// source pins), .dockerignore, and the Git blob of every tracked file the
// Dockerfile copies. It cannot cover what the build fetches -- Alpine and
// Debian security updates applied by `apk upgrade` -- so reuse is limited to
// images from a release published within MAX_AGE_DAYS, and bumping
// rebuildEpoch in release-image-reuse.json rebuilds everything. The digests
// come from the previous release's lock, an asset of an immutable GitHub
// Release that the workflow checks with `gh release verify-asset`, never from
// a mutable registry tag; the image is pulled by that digest.
//
//   node scripts/image-reuse.mjs fingerprints            image<TAB>fingerprint
//   node scripts/image-reuse.mjs env                     HOSPITAL_INPUT_FP_<IMAGE>=...
//   node scripts/image-reuse.mjs previous <lock> <published-at>
//                                          image<TAB>repository@digest of a reusable previous release

import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const FINGERPRINT_LABEL = "org.lospor.hospital.input-fingerprint"
export const MAX_AGE_DAYS = 14

/** The ten release images: their Dockerfile and the stage compose builds. */
export const IMAGES = Object.freeze({
  api: { dockerfile: "infra/docker/api.Dockerfile", target: "runner" },
  browser: { dockerfile: "infra/docker/browser.Dockerfile" },
  caddy: { dockerfile: "infra/docker/caddy.Dockerfile" },
  "curl-worker": { dockerfile: "infra/docker/curl-worker.Dockerfile" },
  migrate: { dockerfile: "infra/docker/api.Dockerfile", target: "migrator" },
  postgres: { dockerfile: "infra/docker/postgres.Dockerfile" },
  pwa: { dockerfile: "infra/docker/pwa.Dockerfile" },
  status: { dockerfile: "infra/docker/status.Dockerfile" },
  tools: { dockerfile: "infra/docker/api.Dockerfile", target: "tools" },
  web: { dockerfile: "infra/docker/web.Dockerfile" },
})

export const envName = image => `HOSPITAL_INPUT_FP_${image.toUpperCase().replace(/-/g, "_")}`

/** Joins backslash-continued lines, then returns every instruction as [keyword, rest]. */
export function instructions(dockerfile) {
  return dockerfile.replace(/\r\n/g, "\n").replace(/\\\n/g, " ").split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const space = line.search(/\s/)
      return space === -1 ? [line.toUpperCase(), ""] : [line.slice(0, space).toUpperCase(), line.slice(space).trim()]
    })
}

/** Repository paths a Dockerfile copies from the build context (not from stages, not URLs). */
export function copiedPaths(dockerfile) {
  const paths = []
  for (const [keyword, rest] of instructions(dockerfile)) {
    if (keyword !== "COPY" && keyword !== "ADD") continue
    const tokens = rest.split(/\s+/)
    if (tokens.some(token => token.startsWith("--from="))) continue
    const sources = tokens.filter(token => !token.startsWith("--")).slice(0, -1)
    for (const source of sources) {
      if (/^[a-z]+:\/\//i.test(source)) continue
      if (/[*?[]/.test(source)) throw new Error(`Wildcard COPY source '${source}' is not fingerprinted; name the paths`)
      paths.push(source.replace(/\/+$/, "").replace(/^\.\//, ""))
    }
  }
  return [...new Set(paths)].sort()
}

/** Every ARG a Dockerfile declares, with its value from the environment or its default. */
export function buildArguments(dockerfile, env) {
  const args = new Map()
  for (const [keyword, rest] of instructions(dockerfile)) {
    if (keyword !== "ARG") continue
    const [name, ...value] = rest.split("=")
    args.set(name.trim(), env[name.trim()] ?? (value.length ? value.join("=") : ""))
  }
  return [...args.entries()].sort(([left], [right]) => left.localeCompare(right))
}

export function fingerprint({ image, target, dockerfileBlob, ignoreBlob, files, args, rebuildEpoch }) {
  const lines = [
    "lospor-hospital-image-input-v1",
    `image\t${image}`,
    `dockerfile\t${dockerfileBlob}`,
    `target\t${target ?? "-"}`,
    `dockerignore\t${ignoreBlob ?? "-"}`,
    `rebuild-epoch\t${rebuildEpoch}`,
    ...args.map(([name, value]) => `arg\t${name}\t${value}`),
    ...files.map(file => `file\t${file}`),
  ]
  return createHash("sha256").update(`${lines.join("\n")}\n`).digest("hex")
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
}

/** mode, blob and path of every tracked file under `path`, as Git records them. */
function trackedFiles(root, path) {
  const out = git(root, "ls-files", "-s", "--", path).split("\n").filter(Boolean)
  if (out.length === 0) throw new Error(`The Dockerfile copies '${path}', which has no tracked files`)
  return out.map(line => {
    const [meta, file] = line.split("\t")
    const [mode, blob] = meta.split(" ")
    return `${mode} ${blob} ${file}`
  })
}

export function computeFingerprints(root, env = process.env) {
  const { rebuildEpoch } = JSON.parse(readFileSync(join(root, "release-image-reuse.json"), "utf8"))
  if (!Number.isSafeInteger(rebuildEpoch) || rebuildEpoch < 1) throw new Error("release-image-reuse.json needs a positive integer rebuildEpoch")
  const blob = path => git(root, "ls-files", "-s", "--", path).split(" ")[1] ?? null
  return Object.entries(IMAGES).map(([image, { dockerfile, target }]) => {
    const text = readFileSync(join(root, dockerfile), "utf8")
    const files = copiedPaths(text).flatMap(path => trackedFiles(root, path)).sort()
    return {
      image,
      fingerprint: fingerprint({
        image, target,
        dockerfileBlob: blob(dockerfile) ?? createHash("sha256").update(text).digest("hex"),
        ignoreBlob: blob(".dockerignore"),
        files,
        args: buildArguments(text, env),
        rebuildEpoch,
      }),
    }
  })
}

/**
 * The previous release's images that may be reused, from its lock, while that
 * release is younger than MAX_AGE_DAYS.
 */
export function previousImages({ lock, publishedAt, now = new Date() }) {
  if (!lock.toString("utf8").startsWith("LOSPOR-HOSPITAL-RELEASE-LOCK-")) throw new Error("The previous release lock is not a release lock")
  const published = Date.parse(publishedAt)
  if (!Number.isFinite(published)) throw new Error(`'${publishedAt}' is not a publication time`)
  const ageDays = (now.getTime() - published) / 86_400_000
  if (ageDays > MAX_AGE_DAYS) return { images: [], reason: `the previous release is ${Math.floor(ageDays)} days old (limit ${MAX_AGE_DAYS})` }
  const images = lock.toString("utf8").split("\n")
    .filter(line => line.startsWith("image\t"))
    .map(line => {
      const [, name, reference, digest] = line.split("\t")
      if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) throw new Error(`Previous lock image ${name} has no digest`)
      return { name, repository: reference.replace(/:[^:/]+$/, ""), digest }
    })
  return { images, reason: null }
}

function main() {
  const root = fileURLToPath(new URL("..", import.meta.url))
  const [command, ...args] = process.argv.slice(2)
  if (command === "fingerprints") {
    for (const { image, fingerprint: value } of computeFingerprints(root)) console.log(`${image}\t${value}`)
  } else if (command === "env") {
    for (const { image, fingerprint: value } of computeFingerprints(root)) console.log(`${envName(image)}=${value}`)
  } else if (command === "previous" && args.length === 2) {
    const result = previousImages({ lock: readFileSync(args[0]), publishedAt: args[1] })
    if (result.reason) console.error(`No image reuse: ${result.reason}.`)
    for (const image of result.images) console.log(`${image.name}\t${image.repository}@${image.digest}`)
  } else {
    console.error("Usage: node scripts/image-reuse.mjs fingerprints | env | previous <lock> <published-at>")
    process.exit(2)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
