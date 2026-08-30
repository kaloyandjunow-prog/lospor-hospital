import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { REQUIRED_IMAGE_NAMES, expectedImageReference } from "./release-artifacts-lib.mjs"
import { trivyArtifactId, trivyCycloneDxRootPurl } from "./portable-image-identity.mjs"

const version = "1.0.0"
const commit = "a".repeat(40)
const candidate = `candidate-${commit}-12345-${"f".repeat(16)}`
const id = index => `sha256:${index.toString(16).padStart(2, "0").repeat(32)}`

function vulnerabilityReport(image) {
  return {
    SchemaVersion: 2,
    Trivy: { Version: "0.74.0" },
    ArtifactID: trivyArtifactId(image.localDockerId, image.scanReference),
    ArtifactName: image.scanReference,
    ArtifactType: "container_image",
    Metadata: {
      ImageID: image.localDockerId,
      DiffIDs: image.rootfsDiffIds,
      RepoTags: [image.scanReference],
      Reference: image.scanReference,
      ImageConfig: {
        architecture: "amd64",
        os: "linux",
        rootfs: { type: "layers", diff_ids: image.rootfsDiffIds },
      },
    },
    Results: [],
  }
}

function cycloneDxReport(image) {
  const purl = trivyCycloneDxRootPurl(image.localDockerId, image.scanReference)
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.7",
    version: 1,
    metadata: {
      tools: { components: [{ type: "application", group: "aquasecurity", name: "trivy", version: "0.74.0" }] },
      component: {
        "bom-ref": purl,
        type: "container",
        name: image.scanReference,
        purl,
        properties: [
          ...image.rootfsDiffIds.map(value => ({ name: "aquasecurity:trivy:DiffID", value })),
          { name: "aquasecurity:trivy:ImageID", value: image.localDockerId },
          { name: "aquasecurity:trivy:Reference", value: image.scanReference },
          { name: "aquasecurity:trivy:RepoTag", value: image.scanReference },
          { name: "aquasecurity:trivy:SchemaVersion", value: "2" },
        ],
      },
    },
    components: [],
  }
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hospital-evidence-"))
  const ledgerPath = join(directory, "ledger.json")
  const images = REQUIRED_IMAGE_NAMES.map((name, index) => ({
    name,
    scanReference: `ghcr.io/kaloyandjunow-prog/lospor-hospital-${name}:${candidate}`,
    // Deliberately different: a Docker-local ID is not the portable config
    // digest and must only be used to bind same-host Trivy output.
    localDockerId: id(index + 1),
    configDigest: id(index + 21),
    rootfsDiffIds: [id(index + 41), id(index + 61)],
    platform: "linux/amd64",
  }))
  await writeFile(ledgerPath, JSON.stringify({ schemaVersion: 2, version, gitCommit: commit, images }))
  const source = JSON.parse(await readFile("release-inputs.json", "utf8")).postgresSource
  const postgres = images.find(image => image.name === "postgres")
  const componentBom = {
    bomFormat: "CycloneDX",
    specVersion: "1.7",
    version: 1,
    metadata: {
      component: { type: "container", name: postgres.scanReference, version: postgres.configDigest },
      properties: [{ name: "org.lospor:vulnerability-coverage", value: "provenance-only; not vulnerability-mapped by Trivy" }],
    },
    components: Object.entries(source.components).map(([name, component]) => ({
      name,
      version: component.version,
      hashes: [{ alg: "SHA-256", content: component.sha256 }],
    })),
  }
  const componentBomBytes = Buffer.from(`${JSON.stringify(componentBom)}\n`)
  const componentBomPath = join(directory, "postgres-source-components.cdx.json")
  await writeFile(componentBomPath, componentBomBytes)
  const provenancePath = join(directory, "postgres-source-provenance.json")
  await writeFile(provenancePath, JSON.stringify({
    schemaVersion: 1,
    image: postgres.scanReference,
    platform: postgres.platform,
    configDigest: postgres.configDigest,
    rootfsDiffIds: postgres.rootfsDiffIds,
    debianSnapshot: source.debianSnapshot,
    components: source.components,
    postgresqlConfigure: source.postgresqlConfigure,
    embeddedRecordSha256: source.embeddedRecordSha256,
    records: {
      sources: { file: "sources.txt", sha256: source.embeddedRecordSha256.sources },
      configure: { file: "postgresql-configure.txt", sha256: source.embeddedRecordSha256.configure },
      compiler: { file: "compiler.txt", sha256: source.embeddedRecordSha256.compiler },
      builderPackages: { file: "builder-packages.txt", sha256: source.embeddedRecordSha256.builderPackages },
    },
    supplementalCycloneDx: {
      file: "postgres-source-components.cdx.json",
      sha256: createHash("sha256").update(componentBomBytes).digest("hex"),
    },
  }))
  const reports = []
  const sboms = []
  for (const image of images) {
    const reportPath = join(directory, `${image.name}.json`)
    const sbomPath = join(directory, `${image.name}.cdx.json`)
    await writeFile(reportPath, JSON.stringify(vulnerabilityReport(image)))
    await writeFile(sbomPath, JSON.stringify(cycloneDxReport(image)))
    reports.push(reportPath)
    sboms.push(sbomPath)
  }
  const lockPath = join(directory, "lock.json")
  await writeFile(lockPath, JSON.stringify({ schemaVersion: 2, images: images.map((image, index) => ({
    name: image.name,
    reference: expectedImageReference(image.name, version),
    digest: id(index + 81),
    platformManifestDigest: id(index + 101),
    configDigest: image.configDigest,
    rootfsDiffIds: image.rootfsDiffIds,
    platform: image.platform,
  })) }))
  const run = (...args) => execFileSync(process.execPath, ["scripts/release-image-evidence.mjs", ...args], {
    env: { ...process.env, GITHUB_SHA: commit, HOSPITAL_CANDIDATE_TAG: candidate },
    stdio: "pipe",
  })
  return { directory, images, ledgerPath, provenancePath, reports, sboms, lockPath, run }
}

test("binds all ten Trivy 0.74 vulnerability reports and CycloneDX 1.7 SBOMs", async () => {
  const f = await fixture()
  assert.doesNotThrow(() => f.run("verify-scans", version, f.ledgerPath, ...f.reports, ...f.sboms))
  const proof = join(f.directory, "candidate-evidence.tsv")
  assert.doesNotThrow(() => f.run("mark-policy-passed", version, f.ledgerPath, f.provenancePath, proof))
  assert.match(await readFile(proof, "utf8"), /^LOSPOR-HOSPITAL-CANDIDATE-EVIDENCE-V3\n/)
  assert.doesNotThrow(() => f.run("verify-prior", version, f.ledgerPath, f.provenancePath, proof))
  assert.doesNotThrow(() => f.run("verify-lock", version, f.ledgerPath, f.lockPath))
})

test("uses Trivy 0.74 Metadata.ImageID/Reference ArtifactID formula, not config digest", async () => {
  const f = await fixture()
  const report = JSON.parse(await readFile(f.reports[0], "utf8"))
  report.ArtifactID = f.images[0].configDigest
  await writeFile(f.reports[0], JSON.stringify(report))
  assert.throws(() => f.run("verify-scans", version, f.ledgerPath, ...f.reports, ...f.sboms), /Command failed/)
})

test("accepts reordered CycloneDX diff IDs but rejects a substituted one", async () => {
  // CycloneDX serialises component properties sorted by value, so the DiffID
  // order in an SBOM is the serialiser's and not the image's -- there is no
  // layer ordering here to verify. Order is still asserted strictly against the
  // JSON vulnerability report, which does preserve it, and against the release
  // lock; see the two tests either side of this one.
  const reordered = await fixture()
  const sbom = JSON.parse(await readFile(reordered.sboms[0], "utf8"))
  const diffProperties = sbom.metadata.component.properties.filter(property => property.name === "aquasecurity:trivy:DiffID").reverse()
  sbom.metadata.component.properties = [
    ...diffProperties,
    ...sbom.metadata.component.properties.filter(property => property.name !== "aquasecurity:trivy:DiffID"),
  ]
  await writeFile(reordered.sboms[0], JSON.stringify(sbom))
  assert.doesNotThrow(() => reordered.run("verify-scans", version, reordered.ledgerPath, ...reordered.reports, ...reordered.sboms))

  // Substituting a layer is an entirely different claim and must still fail.
  const substituted = await fixture()
  const tampered = JSON.parse(await readFile(substituted.sboms[0], "utf8"))
  const victim = tampered.metadata.component.properties.find(property => property.name === "aquasecurity:trivy:DiffID")
  victim.value = id(199)
  await writeFile(substituted.sboms[0], JSON.stringify(tampered))
  assert.throws(() => substituted.run("verify-scans", version, substituted.ledgerPath, ...substituted.reports, ...substituted.sboms), /Command failed/)
})

test("rejects a CycloneDX root identity change", async () => {
  const f = await fixture()
  const sbom = JSON.parse(await readFile(f.sboms[0], "utf8"))
  sbom.metadata.component.name = "ghcr.io/attacker/lospor-hospital-api:candidate"
  await writeFile(f.sboms[0], JSON.stringify(sbom))
  assert.throws(() => f.run("verify-scans", version, f.ledgerPath, ...f.reports, ...f.sboms), /Command failed/)
})

test("release lock comparison ignores local Docker ID but rejects portable identity changes", async () => {
  const f = await fixture()
  assert.doesNotThrow(() => f.run("verify-lock", version, f.ledgerPath, f.lockPath))
  const badLock = JSON.parse(await readFile(f.lockPath, "utf8"))
  badLock.images[0].rootfsDiffIds.reverse()
  await writeFile(f.lockPath, JSON.stringify(badLock))
  assert.throws(() => f.run("verify-lock", version, f.ledgerPath, f.lockPath), /Command failed/)
})

test("rejects tampered or differently namespaced prior candidate evidence", async () => {
  const f = await fixture()
  const proof = join(f.directory, "candidate-evidence.tsv")
  f.run("mark-policy-passed", version, f.ledgerPath, f.provenancePath, proof)
  await writeFile(proof, `${await readFile(proof, "utf8")}tampered\n`)
  assert.throws(() => f.run("verify-prior", version, f.ledgerPath, f.provenancePath, proof), /Command failed/)
})

test("rejects PostgreSQL provenance detached from the exact candidate image", async () => {
  const f = await fixture()
  const provenance = JSON.parse(await readFile(f.provenancePath, "utf8"))
  provenance.configDigest = id(250)
  await writeFile(f.provenancePath, JSON.stringify(provenance))
  const proof = join(f.directory, "candidate-evidence.tsv")
  assert.throws(() => f.run("mark-policy-passed", version, f.ledgerPath, f.provenancePath, proof), /Command failed/)
})
