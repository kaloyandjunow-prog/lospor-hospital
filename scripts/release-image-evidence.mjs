import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { basename, extname, resolve } from "node:path"
import {
  OFFICIAL_IMAGE_REGISTRY,
  REQUIRED_IMAGE_NAMES,
  expectedImageReference,
  validateImageLock,
  validateVersion,
} from "./release-artifacts-lib.mjs"

const [command, versionArg, ledgerPath, ...paths] = process.argv.slice(2)
if (!command || !versionArg || !ledgerPath) {
  throw new Error("Usage: node scripts/release-image-evidence.mjs <create|verify-scans|mark-policy-passed|verify-prior|verify-lock> <version> <ledger.json> [files]")
}
const version = validateVersion(versionArg)
const candidate = process.env.HOSPITAL_CANDIDATE_TAG

function sourceReferences() {
  if (!candidate || !/^candidate-[a-f0-9]{40}-[1-9][0-9]*-[a-f0-9]{16}$/.test(candidate)) {
    throw new Error("HOSPITAL_CANDIDATE_TAG must identify one full Git commit, workflow run, and build-input identity")
  }
  const requiredDigest = (name, env) => {
    const value = process.env[env]
    if (!value || !/@sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`${env} must be digest-pinned for ${name}`)
    return value
  }
  return {
    api: `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-api:${candidate}`,
    browser: `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-browser:${candidate}`,
    caddy: requiredDigest("caddy", "HOSPITAL_CADDY_SOURCE_IMAGE"),
    "curl-worker": requiredDigest("curl-worker", "HOSPITAL_CURL_SOURCE_IMAGE"),
    migrate: `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-migrate:${candidate}`,
    postgres: requiredDigest("postgres", "HOSPITAL_POSTGRES_SOURCE_IMAGE"),
    pwa: `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-pwa:${candidate}`,
    status: `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-status:${candidate}`,
    tools: `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-tools:${candidate}`,
    web: `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-web:${candidate}`,
  }
}

function validateLedger(value) {
  const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort().join(",") : ""
  if (keys !== "gitCommit,images,schemaVersion,version" || value.schemaVersion !== 1 || value.version !== version || value.gitCommit !== process.env.GITHUB_SHA || !Array.isArray(value.images)) {
    throw new Error("Image evidence ledger identity is invalid")
  }
  if (!/^[a-f0-9]{40}$/.test(value.gitCommit ?? "")) throw new Error("Image evidence Git commit is invalid")
  const references = sourceReferences()
  const seen = new Set()
  for (const image of value.images) {
    if (!REQUIRED_IMAGE_NAMES.includes(image?.name) || seen.has(image.name)) throw new Error("Image evidence names are missing or duplicated")
    if (Object.keys(image).sort().join(",") !== "imageId,name,platform,scanReference") {
      throw new Error(`Image evidence has unexpected fields for ${image?.name}`)
    }
    if (typeof image.scanReference !== "string" || !/^sha256:[a-f0-9]{64}$/.test(image.imageId ?? "") || image.platform !== "linux/amd64") {
      throw new Error(`Image evidence is invalid for ${image?.name}`)
    }
    if (image.scanReference !== references[image.name]) throw new Error(`Image evidence has the wrong scan reference for ${image.name}`)
    seen.add(image.name)
  }
  if (seen.size !== REQUIRED_IMAGE_NAMES.length) throw new Error("Image evidence must contain all ten images")
  return value.images.sort((a, b) => a.name.localeCompare(b.name))
}

if (command === "create") {
  const references = sourceReferences()
  const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 24 }).trim()
  const images = REQUIRED_IMAGE_NAMES.map(name => {
    const inspected = JSON.parse(docker("image", "inspect", references[name]))[0]
    if (inspected.Os !== "linux" || inspected.Architecture !== "amd64" || !/^sha256:[a-f0-9]{64}$/.test(inspected.Id ?? "")) {
      throw new Error(`Local image has the wrong identity or platform: ${name}`)
    }
    return { name, scanReference: references[name], imageId: inspected.Id, platform: "linux/amd64" }
  })
  const value = { schemaVersion: 1, version, gitCommit: process.env.GITHUB_SHA, images }
  validateLedger(value)
  await writeFile(resolve(ledgerPath), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  console.log(`Pre-push image evidence ledger written for ${images.length} images.`)
} else if (command === "verify-scans") {
  if (paths.length !== 10) throw new Error("Exactly ten Trivy reports are required")
  const ledger = validateLedger(JSON.parse(await readFile(ledgerPath, "utf8")))
  const byName = new Map(ledger.map(image => [image.name, image]))
  const seen = new Set()
  for (const path of paths) {
    const name = basename(path, extname(path))
    const expected = byName.get(name)
    if (!expected || seen.has(name)) throw new Error(`Unexpected or duplicate Trivy report: ${name}`)
    const report = JSON.parse(await readFile(path, "utf8"))
    if (report.ArtifactName !== expected.scanReference || report.ArtifactID !== expected.imageId) {
      throw new Error(`Trivy did not scan the recorded image identity for ${name}`)
    }
    seen.add(name)
  }
  if (seen.size !== 10) throw new Error("Trivy evidence is incomplete")
  console.log("All ten Trivy reports match the pre-push image IDs.")
} else if (command === "mark-policy-passed" || command === "verify-prior") {
  if (paths.length !== 1) throw new Error(`${command} requires one candidate-evidence.tsv path`)
  const ledgerBytes = await readFile(ledgerPath)
  validateLedger(JSON.parse(ledgerBytes.toString("utf8")))
  const expected = [
    "LOSPOR-HOSPITAL-CANDIDATE-EVIDENCE-V1",
    `release\t${version}`,
    `git-commit\t${process.env.GITHUB_SHA}`,
    `candidate\t${candidate}`,
    `ledger-sha256\t${createHash("sha256").update(ledgerBytes).digest("hex")}`,
    "vulnerability-policy\tpassed",
    "",
  ].join("\n")
  if (command === "mark-policy-passed") {
    await writeFile(resolve(paths[0]), expected, { encoding: "utf8", flag: "wx" })
    console.log("Candidate policy-pass evidence recorded.")
  } else {
    const actual = await readFile(paths[0], "utf8")
    if (actual !== expected) throw new Error("Prior candidate evidence is incomplete, noncanonical, or for different inputs")
    console.log("Prior candidate evidence matches this commit, run namespace, image ledger, and passed policy.")
  }
} else if (command === "verify-lock") {
  if (paths.length !== 1) throw new Error("verify-lock requires one image-lock.json")
  const ledger = validateLedger(JSON.parse(await readFile(ledgerPath, "utf8")))
  const locked = validateImageLock(JSON.parse(await readFile(paths[0], "utf8")), version)
  const byName = new Map(ledger.map(image => [image.name, image]))
  for (const image of locked) {
    const evidence = byName.get(image.name)
    if (evidence.imageId !== image.imageId) throw new Error(`Re-pulled image differs from the scanned pre-push identity: ${image.name}`)
    if (image.reference !== expectedImageReference(image.name, version)) throw new Error(`Unexpected final reference: ${image.name}`)
  }
  console.log("Release image lock matches all ten scanned pre-push image IDs.")
} else {
  throw new Error(`Unknown image evidence command '${command}'`)
}
