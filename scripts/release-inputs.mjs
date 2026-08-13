import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

const EXPECTED = Object.freeze({
  node: "node:24-alpine3.24",
  nginx: "nginx:1.30.4-alpine",
  postgres: "postgres:17.10-bookworm",
  caddyBuilder: "golang:1.26.5-alpine3.24",
  caddyRuntime: "caddy:2.11.4-alpine",
  curl: "curlimages/curl:8.21.0",
  trivy: "aquasec/trivy:0.73.0",
})

const ENVIRONMENT = Object.freeze({
  node: [
    "NODE_API_BASE_IMAGE",
    "NODE_BROWSER_BASE_IMAGE",
    "NODE_PWA_BUILD_BASE_IMAGE",
    "NODE_STATUS_BASE_IMAGE",
    "NODE_WEB_BASE_IMAGE",
  ],
  nginx: ["NGINX_PWA_BASE_IMAGE"],
  postgres: ["POSTGRES_BASE_IMAGE"],
  caddyBuilder: ["CADDY_BUILD_BASE_IMAGE"],
  caddyRuntime: ["CADDY_RUNTIME_BASE_IMAGE"],
  curl: ["CURL_BASE_IMAGE"],
  trivy: ["TRIVY_IMAGE"],
})

const POSTGRES_COMPONENT_NAMES = Object.freeze(["postgresql", "zlib", "acl"])
const POSTGRES_RECORD_NAMES = Object.freeze(["sources", "configure", "compiler", "builderPackages"])

function strictKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unexpected or missing fields`)
  }
}

export function parseReleaseInputs(value) {
  strictKeys(value, ["schemaVersion", "platform", "images", "postgresSource"], "release inputs")
  if (value.schemaVersion !== 3) throw new Error("release inputs must use schemaVersion 3")
  if (value.platform !== "linux/amd64") throw new Error("release inputs must target linux/amd64")
  strictKeys(value.images, Object.keys(EXPECTED), "release input images")
  const images = {}
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const reference = value.images[name]
    const digest = typeof reference === "string" ? reference.slice(`${expected}@sha256:`.length) : ""
    if (reference !== `${expected}@sha256:${digest}` || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error(`release input '${name}' must be ${expected}@sha256:<64 lowercase hex>`)
    }
    images[name] = reference
  }
  const source = value.postgresSource
  strictKeys(source, ["debianSnapshot", "components", "postgresqlConfigure", "embeddedRecordSha256", "vulnerabilityReview"], "PostgreSQL source inputs")
  if (!/^20[0-9]{6}T000000Z$/.test(source.debianSnapshot ?? "")) throw new Error("PostgreSQL Debian snapshot is invalid")
  strictKeys(source.components, POSTGRES_COMPONENT_NAMES, "PostgreSQL source components")
  const components = {}
  for (const name of POSTGRES_COMPONENT_NAMES) {
    const component = source.components[name]
    strictKeys(component, ["version", "url", "sha256"], `PostgreSQL source component '${name}'`)
    if (typeof component.version !== "string" || !/^[0-9]+(?:\.[0-9]+)+$/.test(component.version)
      || typeof component.url !== "string" || !/^https?:\/\/[^\s]+$/.test(component.url)
      || !/^[a-f0-9]{64}$/.test(component.sha256 ?? "")) {
      throw new Error(`PostgreSQL source component '${name}' is invalid`)
    }
    components[name] = Object.freeze({ ...component })
  }
  if (!Array.isArray(source.postgresqlConfigure) || source.postgresqlConfigure.length === 0
    || source.postgresqlConfigure.some(flag => typeof flag !== "string" || flag.length === 0)) {
    throw new Error("PostgreSQL configure flags are invalid")
  }
  strictKeys(source.embeddedRecordSha256, POSTGRES_RECORD_NAMES, "PostgreSQL embedded record hashes")
  for (const name of POSTGRES_RECORD_NAMES) {
    if (!/^[a-f0-9]{64}$/.test(source.embeddedRecordSha256[name] ?? "")) {
      throw new Error(`PostgreSQL embedded record hash '${name}' is invalid`)
    }
  }
  const review = source.vulnerabilityReview
  if (review?.status === "blocked-pending-explicit-review") {
    strictKeys(review, ["status"], "PostgreSQL source vulnerability review")
  } else if (review?.status === "accepted-provenance-only") {
    strictKeys(review, ["status", "release", "reviewedAt", "rationale", "evidenceUrls"], "PostgreSQL source vulnerability review")
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(review.release ?? "")
      || !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(review.reviewedAt ?? "")
      || typeof review.rationale !== "string" || review.rationale.length < 40
      || !Array.isArray(review.evidenceUrls) || review.evidenceUrls.length === 0
      || review.evidenceUrls.some(url => typeof url !== "string" || !/^https:\/\/[^\s]+$/.test(url))) {
      throw new Error("Accepted PostgreSQL source vulnerability review is incomplete")
    }
  } else {
    throw new Error("PostgreSQL source vulnerability review status is invalid")
  }
  const parsedReview = review.status === "blocked-pending-explicit-review"
    ? Object.freeze({ status: review.status })
    : Object.freeze({ ...review, evidenceUrls: Object.freeze([...review.evidenceUrls]) })
  return Object.freeze({
    schemaVersion: 3,
    platform: value.platform,
    images: Object.freeze(images),
    postgresSource: Object.freeze({
      debianSnapshot: source.debianSnapshot,
      components: Object.freeze(components),
      postgresqlConfigure: Object.freeze([...source.postgresqlConfigure]),
      embeddedRecordSha256: Object.freeze({ ...source.embeddedRecordSha256 }),
      vulnerabilityReview: parsedReview,
    }),
  })
}

export function releaseEnvironmentLines(inputs) {
  const parsed = parseReleaseInputs(inputs)
  return Object.entries(ENVIRONMENT).flatMap(([name, variables]) => variables.map(variable => `${variable}=${parsed.images[name]}`))
}

const [command, pathArg = "release-inputs.json"] = process.argv.slice(2)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsed = parseReleaseInputs(JSON.parse(await readFile(resolve(pathArg), "utf8")))
  if (command === "env") console.log(releaseEnvironmentLines(parsed).join("\n"))
  else if (command === "json") console.log(JSON.stringify(parsed, null, 2))
  else throw new Error("Usage: node scripts/release-inputs.mjs <env|json> [release-inputs.json]")
}
