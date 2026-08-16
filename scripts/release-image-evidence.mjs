import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import {
  OFFICIAL_IMAGE_REGISTRY,
  REQUIRED_IMAGE_NAMES,
  expectedImageReference,
  validateImageLock,
  validateVersion,
} from "./release-artifacts-lib.mjs"
import {
  inspectLocalImageIdentity,
  samePortableIdentity,
  trivyArtifactId,
  trivyCycloneDxRootPurl,
  validatePortableIdentity,
} from "./portable-image-identity.mjs"
import { parseReleaseInputs } from "./release-inputs.mjs"

const [command, versionArg, ledgerPath, ...paths] = process.argv.slice(2)
if (!command || !versionArg || !ledgerPath) {
  throw new Error("Usage: node scripts/release-image-evidence.mjs <create|verify-local|verify-ledger-local|verify-portable|verify-scans|mark-policy-passed|verify-prior|verify-lock> <version> <ledger.json> [files-or-image-name]")
}
const version = validateVersion(versionArg)
const candidate = process.env.HOSPITAL_CANDIDATE_TAG
const TRIVY_VERSION = "0.73.0"
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/

function sourceReferences() {
  if (!candidate || !/^candidate-[a-f0-9]{40}-[1-9][0-9]*-[a-f0-9]{16}$/.test(candidate)) {
    throw new Error("HOSPITAL_CANDIDATE_TAG must identify one full Git commit, workflow run, and build-input identity")
  }
  return Object.fromEntries(REQUIRED_IMAGE_NAMES.map(name => [
    name,
    `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-${name}:${candidate}`,
  ]))
}

function sameOrderedStrings(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function validateLedger(value) {
  const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort().join(",") : ""
  if (keys !== "gitCommit,images,schemaVersion,version" || value.schemaVersion !== 2 || value.version !== version || value.gitCommit !== process.env.GITHUB_SHA || !Array.isArray(value.images)) {
    throw new Error("Image evidence ledger identity is invalid")
  }
  if (!/^[a-f0-9]{40}$/.test(value.gitCommit ?? "")) throw new Error("Image evidence Git commit is invalid")
  const references = sourceReferences()
  const seen = new Set()
  for (const image of value.images) {
    if (!REQUIRED_IMAGE_NAMES.includes(image?.name) || seen.has(image.name)) throw new Error("Image evidence names are missing or duplicated")
    if (Object.keys(image).sort().join(",") !== "configDigest,localDockerId,name,platform,rootfsDiffIds,scanReference") {
      throw new Error(`Image evidence has unexpected fields for ${image?.name}`)
    }
    validatePortableIdentity(image, `image evidence for ${image.name}`)
    if (typeof image.scanReference !== "string" || !SHA256_DIGEST.test(image.localDockerId ?? "")) {
      throw new Error(`Image evidence is invalid for ${image?.name}`)
    }
    if (image.scanReference !== references[image.name]) throw new Error(`Image evidence has the wrong scan reference for ${image.name}`)
    seen.add(image.name)
  }
  if (seen.size !== REQUIRED_IMAGE_NAMES.length) throw new Error("Image evidence must contain all ten images")
  return value.images.sort((a, b) => a.name.localeCompare(b.name))
}

function assertVulnerabilityIdentity(report, expected, name) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error(`Trivy report is invalid for ${name}`)
  if (report.SchemaVersion !== 2 || report.Trivy?.Version !== TRIVY_VERSION || report.ArtifactType !== "container_image") {
    throw new Error(`Trivy report schema, version, or type is invalid for ${name}`)
  }
  if (report.ArtifactName !== expected.scanReference
    || report.Metadata?.ImageID !== expected.localDockerId
    || report.Metadata?.Reference !== expected.scanReference) {
    throw new Error(`Trivy vulnerability report references the wrong local image for ${name}`)
  }
  const expectedArtifactId = trivyArtifactId(expected.localDockerId, expected.scanReference)
  if (report.ArtifactID !== expectedArtifactId) {
    throw new Error(`Trivy ArtifactID formula does not match Metadata.ImageID/Reference for ${name}`)
  }
  if (!sameOrderedStrings(report.Metadata?.DiffIDs, expected.rootfsDiffIds)
    || report.Metadata?.ImageConfig?.os !== "linux"
    || report.Metadata?.ImageConfig?.architecture !== "amd64"
    || !sameOrderedStrings(report.Metadata?.ImageConfig?.rootfs?.diff_ids, expected.rootfsDiffIds)) {
    throw new Error(`Trivy vulnerability report has the wrong portable rootfs/platform identity for ${name}`)
  }
  if (!Array.isArray(report.Metadata?.RepoTags) || !report.Metadata.RepoTags.includes(expected.scanReference)) {
    throw new Error(`Trivy vulnerability report does not bind the candidate tag for ${name}`)
  }
}

function propertyValues(component, propertyName) {
  return Array.isArray(component?.properties)
    ? component.properties.filter(property => property?.name === propertyName).map(property => property.value)
    : []
}

function assertOneProperty(component, propertyName, expectedValue, name) {
  const values = propertyValues(component, propertyName)
  if (values.length !== 1 || values[0] !== expectedValue) {
    throw new Error(
      `CycloneDX property ${propertyName} is invalid for ${name}:`
      + `\n    actual:   ${values.length === 1 ? values[0] : `${values.length} values ${JSON.stringify(values)}`}`
      + `\n    expected: ${expectedValue}`,
    )
  }
}

function assertCycloneDxIdentity(bom, expected, name) {
  if (!bom || typeof bom !== "object" || Array.isArray(bom)
    || bom.bomFormat !== "CycloneDX" || bom.specVersion !== "1.7" || bom.version !== 1) {
    throw new Error(`CycloneDX 1.7 document identity is invalid for ${name}`)
  }
  const tools = bom.metadata?.tools?.components
  if (!Array.isArray(tools) || !tools.some(tool => tool?.type === "application"
    && tool?.group === "aquasecurity" && tool?.name === "trivy" && tool?.version === TRIVY_VERSION)) {
    throw new Error(`CycloneDX document was not produced by Trivy ${TRIVY_VERSION} for ${name}`)
  }
  const component = bom.metadata?.component
  const expectedPurl = trivyCycloneDxRootPurl(expected.localDockerId, expected.scanReference, expected.platform)
  if (component?.type !== "container" || component?.name !== expected.scanReference
    || component?.purl !== expectedPurl || component?.["bom-ref"] !== expectedPurl) {
    // Name the field and print both values. Trivy derives the purl from the
    // image's repo tags rather than from the reference it was handed, so a
    // second tag on the same image silently changes it -- a failure that is
    // impossible to diagnose from "is not the recorded image" alone, and which
    // otherwise costs a full release run to identify.
    const differences = [
      ["type", component?.type, "container"],
      ["name", component?.name, expected.scanReference],
      ["purl", component?.purl, expectedPurl],
      ["bom-ref", component?.["bom-ref"], expectedPurl],
    ].filter(([, actual, wanted]) => actual !== wanted)
      .map(([field, actual, wanted]) => `\n  ${field}:\n    actual:   ${actual}\n    expected: ${wanted}`)
      .join("")
    throw new Error(`CycloneDX root component is not the recorded image for ${name}:${differences}`)
  }
  assertOneProperty(component, "aquasecurity:trivy:ImageID", expected.localDockerId, name)
  assertOneProperty(component, "aquasecurity:trivy:Reference", expected.scanReference, name)
  assertOneProperty(component, "aquasecurity:trivy:SchemaVersion", "2", name)
  const actualDiffIds = propertyValues(component, "aquasecurity:trivy:DiffID")
  if (!sameOrderedStrings(actualDiffIds, expected.rootfsDiffIds)) {
    throw new Error(
      `CycloneDX root component has the wrong ordered rootfs diff IDs for ${name}:`
      + `\n    actual:   ${JSON.stringify(actualDiffIds)}`
      + `\n    expected: ${JSON.stringify(expected.rootfsDiffIds)}`,
    )
  }
  const actualRepoTags = propertyValues(component, "aquasecurity:trivy:RepoTag")
  if (!actualRepoTags.includes(expected.scanReference)) {
    throw new Error(
      `CycloneDX root component does not bind the candidate tag for ${name}:`
      + `\n    actual RepoTags: ${JSON.stringify(actualRepoTags)}`
      + `\n    expected to include: ${expected.scanReference}`,
    )
  }
}

async function validatePostgresProvenance(path, postgresEvidence) {
  const bytes = await readFile(path)
  const value = JSON.parse(bytes.toString("utf8"))
  const source = parseReleaseInputs(JSON.parse(await readFile("release-inputs.json", "utf8"))).postgresSource
  if (value?.schemaVersion !== 1 || value.image !== postgresEvidence.scanReference
    || value.platform !== postgresEvidence.platform || value.configDigest !== postgresEvidence.configDigest
    || !sameOrderedStrings(value.rootfsDiffIds, postgresEvidence.rootfsDiffIds)
    || JSON.stringify(value.debianSnapshot) !== JSON.stringify(source.debianSnapshot)
    || JSON.stringify(value.components) !== JSON.stringify(source.components)
    || JSON.stringify(value.postgresqlConfigure) !== JSON.stringify(source.postgresqlConfigure)
    || JSON.stringify(value.embeddedRecordSha256) !== JSON.stringify(source.embeddedRecordSha256)) {
    throw new Error("PostgreSQL source-build provenance does not match the candidate ledger or committed release inputs")
  }
  const expectedRecordFiles = {
    sources: "sources.txt",
    configure: "postgresql-configure.txt",
    compiler: "compiler.txt",
    builderPackages: "builder-packages.txt",
  }
  for (const [name, file] of Object.entries(expectedRecordFiles)) {
    if (value.records?.[name]?.file !== file || value.records[name].sha256 !== source.embeddedRecordSha256[name]) {
      throw new Error(`PostgreSQL source-build provenance has an invalid ${name} record binding`)
    }
  }
  const bomPath = join(dirname(resolve(path)), "postgres-source-components.cdx.json")
  const bomBytes = await readFile(bomPath)
  if (value.supplementalCycloneDx?.file !== "postgres-source-components.cdx.json"
    || value.supplementalCycloneDx.sha256 !== createHash("sha256").update(bomBytes).digest("hex")) {
    throw new Error("PostgreSQL supplemental CycloneDX is missing or differs from its provenance binding")
  }
  const bom = JSON.parse(bomBytes.toString("utf8"))
  const expectedNames = ["postgresql", "zlib", "acl"]
  if (bom?.bomFormat !== "CycloneDX" || bom.specVersion !== "1.7" || bom.version !== 1
    || bom.metadata?.component?.name !== postgresEvidence.scanReference
    || bom.metadata?.component?.version !== postgresEvidence.configDigest
    || bom.metadata?.properties?.find(property => property?.name === "org.lospor:vulnerability-coverage")?.value
      !== "provenance-only; not vulnerability-mapped by Trivy"
    || !Array.isArray(bom.components) || bom.components.length !== 3
    || bom.components.some((component, index) => component?.name !== expectedNames[index]
      || component.version !== source.components[component.name].version
      || component.hashes?.[0]?.content !== source.components[component.name].sha256)) {
    throw new Error("PostgreSQL supplemental CycloneDX does not record the exact source-built components")
  }
  return { bytes, digest: createHash("sha256").update(bytes).digest("hex") }
}

if (command === "create") {
  const references = sourceReferences()
  const images = []
  for (const name of REQUIRED_IMAGE_NAMES) {
    const portable = await inspectLocalImageIdentity(references[name])
    images.push({
      name,
      scanReference: references[name],
      localDockerId: portable.localDockerId,
      configDigest: portable.configDigest,
      rootfsDiffIds: portable.rootfsDiffIds,
      platform: portable.platform,
    })
  }
  const value = { schemaVersion: 2, version, gitCommit: process.env.GITHUB_SHA, images }
  validateLedger(value)
  await writeFile(resolve(ledgerPath), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  console.log(`Pre-push image evidence ledger written for ${images.length} images.`)
} else if (command === "verify-local" || command === "verify-ledger-local" || command === "verify-portable") {
  if (paths.length > 1) throw new Error(`${command} accepts at most one image name`)
  const ledger = validateLedger(JSON.parse(await readFile(ledgerPath, "utf8")))
  if (paths[0] && !REQUIRED_IMAGE_NAMES.includes(paths[0])) throw new Error(`Unknown release image '${paths[0]}'`)
  const selected = paths[0] ? ledger.filter(image => image.name === paths[0]) : ledger
  for (const image of selected) {
    const local = await inspectLocalImageIdentity(image.scanReference)
    if (!samePortableIdentity(local, image)) {
      throw new Error(`Local candidate differs from the portable evidence identity: ${image.name}`)
    }
    if (command !== "verify-portable" && local.localDockerId !== image.localDockerId) {
      throw new Error(`Local candidate differs from the same-host evidence ledger: ${image.name}`)
    }
  }
  console.log(command === "verify-portable"
    ? `All ${selected.length} selected local candidates match the portable evidence identities.`
    : `All ${selected.length} selected local candidates match the same-host evidence ledger.`)
} else if (command === "verify-scans") {
  if (paths.length !== 20) throw new Error("Exactly ten Trivy vulnerability reports and ten CycloneDX SBOMs are required")
  const ledger = validateLedger(JSON.parse(await readFile(ledgerPath, "utf8")))
  const byName = new Map(ledger.map(image => [image.name, image]))
  const vulnerabilitySeen = new Set()
  const sbomSeen = new Set()
  for (const path of paths) {
    const file = basename(path)
    const isSbom = file.endsWith(".cdx.json")
    const name = isSbom ? file.slice(0, -".cdx.json".length) : file.endsWith(".json") ? file.slice(0, -5) : ""
    const expected = byName.get(name)
    const seen = isSbom ? sbomSeen : vulnerabilitySeen
    if (!expected || seen.has(name)) throw new Error(`Unexpected or duplicate Trivy evidence file: ${file}`)
    const report = JSON.parse(await readFile(path, "utf8"))
    if (isSbom) assertCycloneDxIdentity(report, expected, name)
    else assertVulnerabilityIdentity(report, expected, name)
    seen.add(name)
  }
  if (vulnerabilitySeen.size !== 10 || sbomSeen.size !== 10) throw new Error("Trivy vulnerability or SBOM evidence is incomplete")
  console.log("All ten vulnerability reports and all ten CycloneDX 1.7 SBOMs match the same-host image ledger.")
} else if (command === "mark-policy-passed" || command === "verify-prior") {
  if (paths.length !== 2) throw new Error(`${command} requires postgres-source-provenance.json and candidate-evidence.tsv paths`)
  const ledgerBytes = await readFile(ledgerPath)
  const ledger = validateLedger(JSON.parse(ledgerBytes.toString("utf8")))
  const postgres = ledger.find(image => image.name === "postgres")
  const provenance = await validatePostgresProvenance(paths[0], postgres)
  const expected = [
    "LOSPOR-HOSPITAL-CANDIDATE-EVIDENCE-V3",
    `release\t${version}`,
    `git-commit\t${process.env.GITHUB_SHA}`,
    `candidate\t${candidate}`,
    `ledger-sha256\t${createHash("sha256").update(ledgerBytes).digest("hex")}`,
    `postgres-source-provenance-sha256\t${provenance.digest}`,
    "vulnerability-policy\tpassed",
    "cyclonedx-identity\tpassed",
    "postgres-source-provenance\tpassed",
    "postgres-source-vulnerability-coverage\tnot-provided-by-trivy",
    "",
  ].join("\n")
  if (command === "mark-policy-passed") {
    await writeFile(resolve(paths[1]), expected, { encoding: "utf8", flag: "wx" })
    console.log("Candidate policy-pass, SBOM identity, and PostgreSQL source provenance evidence recorded.")
  } else {
    const actual = await readFile(paths[1], "utf8")
    if (actual !== expected) throw new Error("Prior candidate evidence is incomplete, noncanonical, or for different inputs")
    console.log("Prior candidate evidence matches this commit, run namespace, image ledger, policy, SBOM identities, and PostgreSQL source provenance.")
  }
} else if (command === "verify-lock") {
  if (paths.length !== 1) throw new Error("verify-lock requires one image-lock.json")
  const ledger = validateLedger(JSON.parse(await readFile(ledgerPath, "utf8")))
  const locked = validateImageLock(JSON.parse(await readFile(paths[0], "utf8")), version)
  const byName = new Map(ledger.map(image => [image.name, image]))
  for (const image of locked) {
    const evidence = byName.get(image.name)
    if (!samePortableIdentity(evidence, image)) throw new Error(`Registry lock differs from the scanned portable identity: ${image.name}`)
    if (image.reference !== expectedImageReference(image.name, version)) throw new Error(`Unexpected final reference: ${image.name}`)
  }
  console.log("Release image lock matches all ten scanned portable image identities.")
} else {
  throw new Error(`Unknown image evidence command '${command}'`)
}
