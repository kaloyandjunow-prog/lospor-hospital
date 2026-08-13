import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const EXPECTED = Object.freeze({
  node: "node:24-bookworm-slim",
  nginx: "nginx:1.29.1-alpine",
  postgres: "postgres:17.6-bookworm",
  caddy: "caddy:2.10.2-alpine",
  curl: "curlimages/curl:8.17.0",
  trivy: "aquasec/trivy:0.72.0",
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
  postgres: ["HOSPITAL_POSTGRES_SOURCE_IMAGE"],
  caddy: ["HOSPITAL_CADDY_SOURCE_IMAGE"],
  curl: ["HOSPITAL_CURL_SOURCE_IMAGE"],
  trivy: ["TRIVY_IMAGE"],
})

function strictKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unexpected or missing fields`)
  }
}

export function parseReleaseInputs(value) {
  strictKeys(value, ["schemaVersion", "platform", "images"], "release inputs")
  if (value.schemaVersion !== 1) throw new Error("release inputs must use schemaVersion 1")
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
  return Object.freeze({ schemaVersion: 1, platform: value.platform, images: Object.freeze(images) })
}

export function releaseEnvironmentLines(inputs) {
  const parsed = parseReleaseInputs(inputs)
  return Object.entries(ENVIRONMENT).flatMap(([name, variables]) => variables.map(variable => `${variable}=${parsed.images[name]}`))
}

const [command, pathArg = "release-inputs.json"] = process.argv.slice(2)
if (command) {
  const parsed = parseReleaseInputs(JSON.parse(await readFile(resolve(pathArg), "utf8")))
  if (command === "env") console.log(releaseEnvironmentLines(parsed).join("\n"))
  else if (command === "json") console.log(JSON.stringify(parsed, null, 2))
  else throw new Error("Usage: node scripts/release-inputs.mjs <env|json> [release-inputs.json]")
}
