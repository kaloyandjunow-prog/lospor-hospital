import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { promisify } from "node:util"
import { parseReleaseInputs } from "./release-inputs.mjs"
import { inspectLocalImageIdentity } from "./portable-image-identity.mjs"

const execFileAsync = promisify(execFile)
const RECORDS = Object.freeze({
  sources: "sources.txt",
  configure: "postgresql-configure.txt",
  compiler: "compiler.txt",
  builderPackages: "builder-packages.txt",
})

const sha256 = value => createHash("sha256").update(value).digest("hex")

export function verifyPostgresSourceRecords(records, inputs) {
  const source = parseReleaseInputs(inputs).postgresSource
  for (const [name, expected] of Object.entries(source.embeddedRecordSha256)) {
    if (!Buffer.isBuffer(records[name]) || sha256(records[name]) !== expected) {
      throw new Error(`Embedded PostgreSQL ${name} record does not match release inputs`)
    }
  }

  const expectedSources = [
    `debian=http://snapshot.debian.org/archive/debian/${source.debianSnapshot}`,
    `debian-security=http://snapshot.debian.org/archive/debian-security/${source.debianSnapshot}`,
    ...["postgresql", "zlib", "acl"].map(name => {
      const component = source.components[name]
      return `${name}=${component.url} sha256:${component.sha256}`
    }),
    "",
  ].join("\n")
  if (records.sources.toString("utf8") !== expectedSources) {
    throw new Error("Embedded PostgreSQL source URLs, hashes, or Debian snapshots differ from release inputs")
  }

  const expectedConfigure = `${source.postgresqlConfigure.map(flag => ` '${flag}'`).join("")}\n`
  if (records.configure.toString("utf8") !== expectedConfigure) {
    throw new Error("Embedded PostgreSQL configure flags differ from release inputs")
  }

  const compiler = records.compiler.toString("utf8")
  if (!/^gcc \(Debian [^)]+\) [0-9.]+\n/.test(compiler) || !/\nGNU ld \(GNU Binutils for Debian\) [0-9.]+\n/.test(compiler)) {
    throw new Error("Embedded PostgreSQL compiler record is incomplete")
  }
  const packages = records.builderPackages.toString("utf8").split("\n").filter(Boolean)
  if (packages.length < 100 || packages.some(line => !/^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?=\S+$/.test(line))
    || packages.some((line, index) => index > 0 && packages[index - 1].localeCompare(line) >= 0)) {
    throw new Error("Embedded PostgreSQL builder package manifest is incomplete or noncanonical")
  }
  for (const required of ["bison=", "build-essential=", "flex=", "gcc=", "libicu-dev:amd64=", "libssl-dev:amd64=", "make="]) {
    if (!packages.some(line => line.startsWith(required))) throw new Error(`Embedded builder package manifest lacks ${required}`)
  }
  return source
}

export function supplementalCycloneDx(source, identity, image) {
  const components = Object.entries(source.components).map(([name, component]) => {
    const purl = `pkg:generic/${name}@${component.version}`
    return {
      "bom-ref": purl,
      type: "library",
      name,
      version: component.version,
      hashes: [{ alg: "SHA-256", content: component.sha256 }],
      purl,
      externalReferences: [{ type: "distribution", url: component.url }],
      properties: [
        { name: "org.lospor:source-built", value: "true" },
        { name: "org.lospor:image-config-digest", value: identity.configDigest },
      ],
    }
  })
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.7",
    version: 1,
    metadata: {
      component: { type: "container", name: image, version: identity.configDigest },
      properties: [
        { name: "org.lospor:supplements-trivy-sbom", value: "postgres.cdx.json" },
        { name: "org.lospor:vulnerability-coverage", value: "provenance-only; not vulnerability-mapped by Trivy" },
      ],
    },
    components,
  }
}

export function requireExplicitVulnerabilityReview(version, inputs) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version ?? "")) throw new Error("Release version is invalid")
  const review = parseReleaseInputs(inputs).postgresSource.vulnerabilityReview
  if (review.status !== "accepted-provenance-only" || review.release !== version) {
    throw new Error(
      `Release ${version} is blocked: Trivy does not vulnerability-map source-built PostgreSQL, zlib, or ACL. `
      + "Supply a reviewed, release-specific PostgreSQL source vulnerability decision in release-inputs.json or add supported scanner coverage.",
    )
  }
  return review
}

async function create(image, inputsPath, outputPath) {
  const inputs = JSON.parse(await readFile(resolve(inputsPath), "utf8"))
  const directory = resolve(outputPath)
  await mkdir(directory, { recursive: false })
  const { stdout } = await execFileAsync("docker", ["create", image])
  const container = stdout.trim()
  if (!/^[a-f0-9]{64}$/.test(container)) throw new Error("Docker returned an invalid provenance extraction container ID")
  const records = {}
  try {
    for (const [name, file] of Object.entries(RECORDS)) {
      const destination = join(directory, file)
      await execFileAsync("docker", ["cp", `${container}:/opt/lospor-postgresql/share/lospor-build/${file}`, destination])
      records[name] = await readFile(destination)
    }
  } finally {
    await execFileAsync("docker", ["rm", container]).catch(() => {})
  }
  const source = verifyPostgresSourceRecords(records, inputs)
  const identity = await inspectLocalImageIdentity(image)
  const componentBomBytes = Buffer.from(`${JSON.stringify(supplementalCycloneDx(source, identity, image), null, 2)}\n`)
  const provenance = {
    schemaVersion: 1,
    image,
    platform: identity.platform,
    configDigest: identity.configDigest,
    rootfsDiffIds: identity.rootfsDiffIds,
    debianSnapshot: source.debianSnapshot,
    components: source.components,
    postgresqlConfigure: source.postgresqlConfigure,
    embeddedRecordSha256: source.embeddedRecordSha256,
    records: Object.fromEntries(Object.entries(RECORDS).map(([name, file]) => [name, { file, sha256: sha256(records[name]) }])),
    supplementalCycloneDx: { file: "postgres-source-components.cdx.json", sha256: sha256(componentBomBytes) },
  }
  await writeFile(join(directory, "postgres-source-provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" })
  await writeFile(join(directory, "postgres-source-components.cdx.json"), componentBomBytes, { flag: "wx" })
  console.log(`Verified source-built PostgreSQL provenance from ${image} into ${basename(directory)}.`)
}

const [command, image, inputsPath, outputPath] = process.argv.slice(2)
if (command) {
  if (command === "create" && image && inputsPath && outputPath && process.argv.slice(2).length === 4) {
    await create(image, inputsPath, outputPath)
  } else if (command === "require-vulnerability-review" && image && inputsPath && !outputPath && process.argv.slice(2).length === 3) {
    const inputs = JSON.parse(await readFile(resolve(inputsPath), "utf8"))
    requireExplicitVulnerabilityReview(image, inputs)
    console.log(`Explicit source-component vulnerability review accepted for release ${image}.`)
  } else {
    throw new Error("Usage: node scripts/postgres-source-provenance.mjs <create <candidate-image> <release-inputs.json> <new-output-directory>|require-vulnerability-review <release-version> <release-inputs.json>>")
  }
}
