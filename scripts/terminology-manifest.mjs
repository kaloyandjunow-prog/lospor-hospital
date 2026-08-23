import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, readdir, readFile, realpath } from "node:fs/promises"
import { basename, dirname, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"

const REQUIRED_ROLES = new Map([
  ["vocabulary", "VOCABULARY.csv"],
  ["domain", "DOMAIN.csv"],
  ["concept", "CONCEPT.csv"],
  ["relationship", "CONCEPT_RELATIONSHIP.csv"],
  ["ancestor", "CONCEPT_ANCESTOR.csv"],
  ["synonym", "CONCEPT_SYNONYM.csv"],
])
const ALLOWED_ROLES = new Set([...REQUIRED_ROLES.keys(), "bulgarianIcd", "supporting"])
const EXPECTATION_KEYS = [
  "icd10Codes",
  "icd10BulgarianLabels",
  "atcCodes",
  "labLoinc",
  "omopConcepts",
  "omopRelationships",
  "omopAncestors",
  "conceptMaps",
]

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(record(value, label)).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unexpected or missing fields`)
  }
}

function text(value, label, pattern = /^[^\t\r\n]{1,200}$/) {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid`)
  return value
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
  return value
}

function safePackagePath(value) {
  const checked = text(value, "terminology file path", /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/)
  if (checked === "manifest.json" || basename(checked) !== checked) {
    throw new Error(`unsafe terminology file path: ${checked}`)
  }
  return checked
}

export function parseTerminologyManifest(value) {
  exactKeys(value, ["schemaVersion", "packageId", "version", "source", "licence", "files", "expectations"], "manifest")
  if (value.schemaVersion !== 1) throw new Error("manifest schemaVersion must be 1")
  const packageId = text(value.packageId, "packageId", /^[a-z0-9][a-z0-9._-]{2,79}$/)
  const version = text(value.version, "version", /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/)

  exactKeys(value.source, ["name", "reference"], "source")
  const source = {
    name: text(value.source.name, "source.name"),
    reference: text(value.source.reference, "source.reference", /^[^\t\r\n]{1,500}$/),
  }
  exactKeys(value.licence, ["identifier", "approvedBy", "approvedAt"], "licence")
  const approvedAt = text(value.licence.approvedAt, "licence.approvedAt", /^20\d\d-\d\d-\d\d$/)
  const approvedDate = new Date(`${approvedAt}T00:00:00.000Z`)
  if (Number.isNaN(approvedDate.getTime()) || approvedDate.toISOString().slice(0, 10) !== approvedAt) {
    throw new Error("licence.approvedAt is not a real calendar date")
  }
  const licence = {
    identifier: text(value.licence.identifier, "licence.identifier"),
    approvedBy: text(value.licence.approvedBy, "licence.approvedBy"),
    approvedAt,
  }

  if (!Array.isArray(value.files) || value.files.length === 0) throw new Error("files must be a non-empty array")
  const seenPaths = new Set()
  const seenRoles = new Map()
  const files = value.files.map((entry, index) => {
    exactKeys(entry, ["path", "role", "required", "sha256"], `files[${index}]`)
    const path = safePackagePath(entry.path)
    if (seenPaths.has(path)) throw new Error(`duplicate terminology file path: ${path}`)
    seenPaths.add(path)
    const role = text(entry.role, `files[${index}].role`, /^[A-Za-z][A-Za-z0-9]{0,39}$/)
    if (!ALLOWED_ROLES.has(role)) throw new Error(`unsupported terminology file role: ${role}`)
    if (typeof entry.required !== "boolean") throw new Error(`files[${index}].required must be boolean`)
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`files[${index}].sha256 must be 64 lowercase hexadecimal characters`)
    }
    if (role !== "supporting") {
      if (seenRoles.has(role)) throw new Error(`duplicate terminology role: ${role}`)
      seenRoles.set(role, path)
    }
    return { path, role, required: entry.required, sha256: entry.sha256 }
  })
  for (const [role, requiredPath] of REQUIRED_ROLES) {
    if (seenRoles.get(role) !== requiredPath) throw new Error(`${requiredPath} must be the required ${role} file`)
    if (!files.find(file => file.role === role)?.required) throw new Error(`${requiredPath} must be marked required`)
  }
  const bulgarian = files.find(file => file.role === "bulgarianIcd")
  if (!bulgarian?.required || !/^ICD10.*\.xlsx$/i.test(bulgarian.path)) {
    throw new Error("one required ICD10*.xlsx file must have role bulgarianIcd")
  }

  exactKeys(value.expectations, ["minimumRows", "requireRelationshipIntegrity", "requireMappedConcepts"], "expectations")
  exactKeys(value.expectations.minimumRows, EXPECTATION_KEYS, "expectations.minimumRows")
  const minimumRows = Object.fromEntries(
    EXPECTATION_KEYS.map(key => [key, positiveInteger(value.expectations.minimumRows[key], `minimumRows.${key}`)]),
  )
  if (value.expectations.requireRelationshipIntegrity !== true || value.expectations.requireMappedConcepts !== true) {
    throw new Error("relationship integrity and mapped concepts must both be required")
  }

  return Object.freeze({
    schemaVersion: 1,
    packageId,
    version,
    source: Object.freeze(source),
    licence: Object.freeze(licence),
    files: Object.freeze(files.map(file => Object.freeze(file))),
    expectations: Object.freeze({
      minimumRows: Object.freeze(minimumRows),
      requireRelationshipIntegrity: true,
      requireMappedConcepts: true,
    }),
  })
}

async function sha256(path) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

export async function verifyTerminologyPackage(manifestPath, now = new Date()) {
  const absoluteManifest = resolve(manifestPath)
  const packageRoot = dirname(absoluteManifest)
  const [packageInfo, manifestInfo, realPackageRoot] = await Promise.all([
    lstat(packageRoot),
    lstat(absoluteManifest),
    realpath(packageRoot),
  ])
  if (!packageInfo.isDirectory() || packageInfo.isSymbolicLink() || realPackageRoot !== packageRoot) {
    throw new Error("terminology package root must be a real directory")
  }
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.nlink !== 1) {
    throw new Error("manifest.json must be one regular, singly-linked file")
  }
  const manifestBytes = await readFile(absoluteManifest)
  const manifest = parseTerminologyManifest(JSON.parse(manifestBytes.toString("utf8")))
  if (new Date(`${manifest.licence.approvedAt}T00:00:00.000Z`) > now) {
    throw new Error("licence approval date cannot be in the future")
  }
  const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex")

  const entries = await readdir(packageRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name !== "manifest.json" && (!entry.isFile() || entry.isSymbolicLink())) {
      throw new Error(`terminology package contains a non-regular entry: ${entry.name}`)
    }
  }
  const actualNames = entries.filter(entry => entry.name !== "manifest.json").map(entry => entry.name).sort()
  const listedNames = manifest.files.map(file => file.path).sort()
  if (actualNames.length !== listedNames.length || actualNames.some((name, index) => name !== listedNames[index])) {
    throw new Error("package files do not exactly match the manifest")
  }

  const files = []
  for (const file of manifest.files) {
    const absolute = resolve(packageRoot, file.path)
    if (!absolute.startsWith(`${packageRoot}${sep}`)) throw new Error(`unsafe package path: ${file.path}`)
    const info = await lstat(absolute)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
      throw new Error(`terminology package entry is not one regular, singly-linked file: ${file.path}`)
    }
    const actualSha256 = await sha256(absolute)
    if (actualSha256 !== file.sha256) throw new Error(`checksum mismatch for ${file.path}`)
    files.push({ ...file, bytes: info.size })
  }

  return {
    schemaVersion: 1,
    packageId: manifest.packageId,
    version: manifest.version,
    source: manifest.source,
    licence: manifest.licence,
    manifestSha256,
    verifiedAt: now.toISOString(),
    files,
    expectations: manifest.expectations,
  }
}

function fields(evidence) {
  const rows = [
    ["MANIFEST_SHA256", evidence.manifestSha256],
    ["PACKAGE_ID", evidence.packageId],
    ["PACKAGE_VERSION", evidence.version],
    ["SOURCE_NAME", evidence.source.name],
    ["LICENCE_IDENTIFIER", evidence.licence.identifier],
    ...EXPECTATION_KEYS.map(key => [`MIN_${key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}`, evidence.expectations.minimumRows[key]]),
  ]
  return rows.map(row => row.join("\t")).join("\n")
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invoked) {
  const [command, manifestPath] = process.argv.slice(2)
  if (!manifestPath || !["verify", "fields"].includes(command)) {
    throw new Error("Usage: terminology-manifest.mjs <verify|fields> <manifest.json>")
  }
  const evidence = await verifyTerminologyPackage(manifestPath)
  if (command === "verify") process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  else process.stdout.write(`${fields(evidence)}\n`)
}
