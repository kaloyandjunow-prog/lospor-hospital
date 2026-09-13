// The release dossier: one file that says what a release is, who built it, what
// its images carry, and what updating to it means.
//
// It lives inside the security-evidence archive, so the chain that already
// protects every release byte covers it too: the maintainer's signature covers
// release.lock, the lock covers the evidence archive, and the archive holds the
// dossier. No lock format, no host verifier and no installer had to change to
// carry it. It indexes, and never replaces, the artifacts it names: every digest
// in it is checked against the lock or against the file it points at.

import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { basename, join } from "node:path"

export const DOSSIER_FILE = "release-dossier.json"
const IMAGES = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]
const SHA256 = /^[a-f0-9]{64}$/
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const COMMIT = /^[a-f0-9]{40}$/
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const MIGRATION = /^\d{14}_[a-z0-9_]{1,80}$/

function fail(message) {
  throw new Error(`Release dossier: ${message}`)
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort().join(",")
  if (actual !== [...keys].sort().join(",")) fail(`${label} must have exactly ${keys.join(", ")}`)
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a whole number`)
  return value
}

async function fileRecord(path, relative) {
  const bytes = await readFile(path)
  return { file: relative, sha256: createHash("sha256").update(bytes).digest("hex") }
}

async function artifact(path) {
  const details = await stat(path)
  const bytes = await readFile(path)
  return { file: basename(path), bytes: details.size, sha256: createHash("sha256").update(bytes).digest("hex") }
}

/** The one compatibility row the deployment ships, read exactly as release-compatibility.sh reads it. */
export function parseCompatibility(text) {
  const lines = text.split("\n").filter(Boolean)
  if (lines.length !== 1) fail("release-compatibility.tsv must be exactly one line")
  const fields = lines[0].split("\t")
  if (fields.length !== 7 || fields[0] !== "LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1") fail("release-compatibility.tsv has an unsupported shape")
  const [, version, schemaMinimum, schemaMaximum, rollbackPolicy, , windowDays] = fields
  if (!VERSION.test(version) || !MIGRATION.test(schemaMinimum) || !MIGRATION.test(schemaMaximum)) fail("release-compatibility.tsv is invalid")
  if (!["backup-required", "service-compatible"].includes(rollbackPolicy)) fail("release-compatibility.tsv names an unknown rollback policy")
  return { version, schemaMinimum, schemaMaximum, rollbackPolicy, rollbackWindowDays: Number(windowDays) }
}

export async function createReleaseDossier({
  version, commit, createdAt, repository, runId, runAttempt,
  imageLock, deploymentArchive, offlineArchives, evidenceDirectory,
  compatibilityText, riskExceptions, upstream,
}) {
  if (!VERSION.test(version) || !COMMIT.test(commit) || !REPOSITORY.test(repository)) fail("release identity is invalid")
  if (!/^[1-9]\d*$/.test(String(runId)) || !Number.isSafeInteger(runAttempt) || runAttempt < 1) fail("build run is invalid")
  const compatibility = parseCompatibility(compatibilityText)
  if (compatibility.version !== version) fail(`release-compatibility.tsv describes ${compatibility.version}, not ${version}`)

  const images = imageLock.images.map(image => ({ name: image.name, reference: image.reference, digest: image.digest }))
  const perImage = {}
  const vulnerabilityReports = []
  const sboms = []
  const findings = new Set()
  let critical = 0
  let high = 0
  for (const name of IMAGES) {
    const reportPath = join(evidenceDirectory, "vulnerabilities", `${name}.json`)
    const sbomPath = join(evidenceDirectory, "sboms", `${name}.cdx.json`)
    const report = JSON.parse(await readFile(reportPath, "utf8"))
    const sbom = JSON.parse(await readFile(sbomPath, "utf8"))
    const tally = { critical: 0, high: 0 }
    for (const result of Array.isArray(report.Results) ? report.Results : []) {
      for (const finding of Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities : []) {
        const severity = String(finding.Severity ?? "").toUpperCase()
        if (severity !== "HIGH" && severity !== "CRITICAL") continue
        // One finding per image, vulnerability and package, however many
        // targets inside the image report it.
        const key = `${name}\t${finding.VulnerabilityID}\t${finding.PkgName}`
        if (findings.has(key)) continue
        findings.add(key)
        if (severity === "CRITICAL") tally.critical += 1
        else tally.high += 1
      }
    }
    perImage[name] = tally
    critical += tally.critical
    high += tally.high
    vulnerabilityReports.push({ image: name, ...(await fileRecord(reportPath, `vulnerabilities/${name}.json`)) })
    sboms.push({
      image: name,
      ...(await fileRecord(sbomPath, `sboms/${name}.cdx.json`)),
      components: Array.isArray(sbom.components) ? sbom.components.length : 0,
    })
  }
  const exceptions = riskExceptions.exceptions
    .filter(exception => exception.release === version)
    .map(exception => ({ image: exception.image, vulnerabilityId: exception.vulnerabilityId, package: exception.package, expiresAt: exception.expiresAt }))
  const provenancePath = join(evidenceDirectory, "postgres-source-provenance", "postgres-source-provenance.json")
  // A vendored source is pinned by Git commit; a vendored package by the
  // SHA-256 of its archive. Either way the dossier carries the pin.
  const upstreamSources = Object.fromEntries(
    Object.entries(upstream.sources ?? {}).map(([name, source]) => [name, {
      version: source.version,
      identity: source.commit ? `commit:${source.commit}` : `sha256:${source.sha256}`,
    }]),
  )

  return parseReleaseDossier({
    schemaVersion: 1,
    kind: "lospor-hospital-release-dossier",
    release: { version, tag: `hospital-${version}`, commit, platform: "linux/amd64", createdAt },
    build: {
      repository,
      workflow: ".github/workflows/release.yml",
      runId: String(runId),
      runAttempt,
      runUrl: `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}`,
    },
    compatibility: {
      schemaMinimum: compatibility.schemaMinimum,
      schemaMaximum: compatibility.schemaMaximum,
      rollbackPolicy: compatibility.rollbackPolicy,
      rollbackWindowDays: compatibility.rollbackWindowDays,
    },
    images,
    vulnerabilities: { severities: ["CRITICAL", "HIGH"], critical, high, perImage, exceptions },
    evidence: {
      vulnerabilityReports,
      sboms,
      riskExceptions: await fileRecord(join(evidenceDirectory, "risk-exceptions.json"), "risk-exceptions.json"),
      imageLock: await fileRecord(join(evidenceDirectory, "image-lock.json"), "image-lock.json"),
      postgresSourceProvenance: await fileRecord(provenancePath, "postgres-source-provenance/postgres-source-provenance.json"),
    },
    artifacts: {
      deployment: await artifact(deploymentArchive),
      offlineParts: await Promise.all(offlineArchives.map(artifact)),
    },
    upstream: upstreamSources,
  })
}

function evidenceRecord(value, label) {
  exactKeys(value, ["file", "sha256"], label)
  if (typeof value.file !== "string" || !/^[a-z0-9./-]{1,120}$/.test(value.file) || value.file.includes("..")) fail(`${label} file is unsafe`)
  if (!SHA256.test(value.sha256)) fail(`${label} SHA-256 is invalid`)
}

function artifactRecord(value, label) {
  exactKeys(value, ["file", "bytes", "sha256"], label)
  if (typeof value.file !== "string" || !/^lospor-hospital-[A-Za-z0-9.-]{1,120}$/.test(value.file)) fail(`${label} file is invalid`)
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1 || !SHA256.test(value.sha256)) fail(`${label} is invalid`)
}

export function parseReleaseDossier(value) {
  exactKeys(value, ["schemaVersion", "kind", "release", "build", "compatibility", "images", "vulnerabilities", "evidence", "artifacts", "upstream"], "dossier")
  if (value.schemaVersion !== 1 || value.kind !== "lospor-hospital-release-dossier") fail("unsupported schema")
  exactKeys(value.release, ["version", "tag", "commit", "platform", "createdAt"], "release")
  const { version } = value.release
  if (!VERSION.test(version) || value.release.tag !== `hospital-${version}` || !COMMIT.test(value.release.commit)
    || value.release.platform !== "linux/amd64" || new Date(value.release.createdAt).toISOString() !== value.release.createdAt) {
    fail("release identity is invalid")
  }
  exactKeys(value.build, ["repository", "workflow", "runId", "runAttempt", "runUrl"], "build")
  if (!REPOSITORY.test(value.build.repository) || value.build.workflow !== ".github/workflows/release.yml"
    || !/^[1-9]\d*$/.test(value.build.runId) || !Number.isSafeInteger(value.build.runAttempt) || value.build.runAttempt < 1
    || value.build.runUrl !== `https://github.com/${value.build.repository}/actions/runs/${value.build.runId}/attempts/${value.build.runAttempt}`) {
    fail("build provenance is invalid")
  }
  exactKeys(value.compatibility, ["schemaMinimum", "schemaMaximum", "rollbackPolicy", "rollbackWindowDays"], "compatibility")
  if (!MIGRATION.test(value.compatibility.schemaMinimum) || !MIGRATION.test(value.compatibility.schemaMaximum)
    || !["backup-required", "service-compatible"].includes(value.compatibility.rollbackPolicy)) fail("compatibility is invalid")
  count(value.compatibility.rollbackWindowDays, "rollback window")
  if (!Array.isArray(value.images) || value.images.length !== IMAGES.length) fail(`exactly ${IMAGES.length} images are required`)
  value.images.forEach((image, index) => {
    exactKeys(image, ["name", "reference", "digest"], `image ${index}`)
    if (!IMAGES.includes(image.name) || typeof image.reference !== "string" || !/^sha256:[a-f0-9]{64}$/.test(image.digest)) fail(`image ${index} is invalid`)
  })
  if (new Set(value.images.map(image => image.name)).size !== IMAGES.length) fail("images must be distinct")
  exactKeys(value.vulnerabilities, ["severities", "critical", "high", "perImage", "exceptions"], "vulnerabilities")
  if (value.vulnerabilities.severities.join(",") !== "CRITICAL,HIGH") fail("vulnerability severities are invalid")
  count(value.vulnerabilities.critical, "critical findings")
  count(value.vulnerabilities.high, "high findings")
  exactKeys(value.vulnerabilities.perImage, IMAGES, "per-image vulnerabilities")
  let critical = 0
  let high = 0
  for (const name of IMAGES) {
    exactKeys(value.vulnerabilities.perImage[name], ["critical", "high"], `${name} vulnerabilities`)
    critical += count(value.vulnerabilities.perImage[name].critical, `${name} critical`)
    high += count(value.vulnerabilities.perImage[name].high, `${name} high`)
  }
  if (critical !== value.vulnerabilities.critical || high !== value.vulnerabilities.high) fail("vulnerability totals do not add up")
  if (!Array.isArray(value.vulnerabilities.exceptions) || value.vulnerabilities.exceptions.length > 200) fail("exceptions are invalid")
  value.vulnerabilities.exceptions.forEach((exception, index) => {
    exactKeys(exception, ["image", "vulnerabilityId", "package", "expiresAt"], `exception ${index}`)
    if (!IMAGES.includes(exception.image) || !/^[A-Z][A-Z0-9-]{2,63}$/.test(exception.vulnerabilityId)
      || typeof exception.package !== "string" || !/^[A-Za-z0-9._+:@/-]{1,128}$/.test(exception.package) || !DAY.test(exception.expiresAt)) {
      fail(`exception ${index} is invalid`)
    }
  })
  exactKeys(value.evidence, ["vulnerabilityReports", "sboms", "riskExceptions", "imageLock", "postgresSourceProvenance"], "evidence")
  for (const [list, label] of [[value.evidence.vulnerabilityReports, "vulnerability report"], [value.evidence.sboms, "SBOM"]]) {
    if (!Array.isArray(list) || list.length !== IMAGES.length) fail(`one ${label} per image is required`)
    list.forEach((item, index) => {
      const { image, components, ...record } = item ?? {}
      if (!IMAGES.includes(image)) fail(`${label} ${index} names no release image`)
      if (label === "SBOM") count(components, `SBOM ${index} components`)
      else if (components !== undefined) fail(`${label} ${index} has unexpected fields`)
      evidenceRecord(record, `${label} ${index}`)
    })
    if (new Set(list.map(item => item.image)).size !== IMAGES.length) fail(`${label}s must cover every image once`)
  }
  evidenceRecord(value.evidence.riskExceptions, "risk exceptions")
  evidenceRecord(value.evidence.imageLock, "image lock")
  evidenceRecord(value.evidence.postgresSourceProvenance, "PostgreSQL source provenance")
  exactKeys(value.artifacts, ["deployment", "offlineParts"], "artifacts")
  artifactRecord(value.artifacts.deployment, "deployment")
  if (!Array.isArray(value.artifacts.offlineParts) || value.artifacts.offlineParts.length < 1 || value.artifacts.offlineParts.length > 999) fail("offline parts are invalid")
  value.artifacts.offlineParts.forEach((part, index) => artifactRecord(part, `offline part ${index}`))
  if (!value.upstream || typeof value.upstream !== "object" || Array.isArray(value.upstream)) fail("upstream must be an object")
  for (const [name, source] of Object.entries(value.upstream)) {
    exactKeys(source, ["version", "identity"], `upstream ${name}`)
    if (!/^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(name) || typeof source.version !== "string" || !/^[0-9A-Za-z.+-]{1,40}$/.test(source.version)
      || !/^(commit:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/.test(source.identity ?? "")) {
      fail(`upstream ${name} is invalid`)
    }
  }
  return value
}

/**
 * Checks the dossier against the signed release lock and the evidence beside
 * it. The run is checked too when the caller knows which run it expects.
 */
export async function verifyReleaseDossier({ dossier, lockText, evidenceDirectory, expectedRunId, expectedRunAttempt }) {
  const parsed = parseReleaseDossier(dossier)
  const rows = lockText.split("\n").filter(Boolean).map(line => line.split("\t"))
  const release = rows.filter(row => row[0] === "release")
  if (release.length !== 1) fail("the lock must have exactly one release line")
  const [, version, tag, commit] = release[0]
  if (parsed.release.version !== version || parsed.release.tag !== tag || parsed.release.commit !== commit) {
    fail(`it describes ${parsed.release.tag} at ${parsed.release.commit}, but the lock is ${tag} at ${commit}`)
  }
  const locked = role => rows.filter(row => row[0] === "artifact" && row[1] === role)
    .map(row => ({ file: row[3], bytes: Number(row[4]), sha256: row[5] }))
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
  if (!same(locked("deployment"), [parsed.artifacts.deployment])) fail("its deployment archive is not the one in the lock")
  if (!same(locked("offline-part"), parsed.artifacts.offlineParts)) fail("its offline parts are not the ones in the lock")
  const lockedImages = rows.filter(row => row[0] === "image").map(row => `${row[1]}\t${row[2]}\t${row[3]}`).sort()
  const dossierImages = parsed.images.map(image => `${image.name}\t${image.reference}\t${image.digest}`).sort()
  if (!same(lockedImages, dossierImages)) fail("its images are not the ones in the lock")
  if (expectedRunId !== undefined && (parsed.build.runId !== String(expectedRunId) || parsed.build.runAttempt !== Number(expectedRunAttempt))) {
    fail(`it was built by run ${parsed.build.runId} attempt ${parsed.build.runAttempt}, not run ${expectedRunId} attempt ${expectedRunAttempt}`)
  }
  const records = [
    ...parsed.evidence.vulnerabilityReports,
    ...parsed.evidence.sboms,
    parsed.evidence.riskExceptions,
    parsed.evidence.imageLock,
    parsed.evidence.postgresSourceProvenance,
  ]
  for (const record of records) {
    let bytes
    try {
      bytes = await readFile(join(evidenceDirectory, record.file))
    } catch {
      fail(`${record.file} is missing from the security evidence`)
    }
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256) fail(`${record.file} does not match the dossier`)
  }
  return parsed
}

/** The dossier in a few plain lines, for the maintainer and the build summary. */
export function summarizeReleaseDossier(dossier) {
  const { release, build, compatibility, vulnerabilities, evidence, upstream } = dossier
  const expiries = vulnerabilities.exceptions.map(exception => exception.expiresAt).sort()
  return [
    `LOSPOR Hospital ${release.version}, commit ${release.commit}`,
    `Built by ${build.repository} ${build.workflow}, run ${build.runId} attempt ${build.runAttempt} (${build.runUrl})`,
    `${dossier.images.length} images, each with a software bill of materials (${evidence.sboms.reduce((total, sbom) => total + sbom.components, 0)} components in all)`,
    `Vulnerabilities: ${vulnerabilities.critical} critical, ${vulnerabilities.high} high; ${vulnerabilities.exceptions.length} accepted with a dated exception${expiries.length ? ` (first expires ${expiries[0]})` : ""}`,
    compatibility.rollbackPolicy === "service-compatible"
      ? `Updating to it: services can roll back for ${compatibility.rollbackWindowDays} day(s) after migration`
      : "Updating to it: a verified backup is required to go back after migration",
    `Database schema up to ${compatibility.schemaMaximum}`,
    `Built from ${Object.entries(upstream).map(([name, source]) => `${name} ${source.version}`).join(", ")}`,
  ]
}
