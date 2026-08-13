import { pathToFileURL } from "node:url"

const ACCEPTED_MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
]

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/
const TAG = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/

export function parseGhcrTag(reference) {
  if (typeof reference !== "string" || !reference.startsWith("ghcr.io/")) {
    throw new Error("GHCR tag reference must start with ghcr.io/")
  }
  if (reference.includes("@")) throw new Error("GHCR tag classifier does not accept digest references")
  const nameAndTag = reference.slice("ghcr.io/".length)
  const separator = nameAndTag.lastIndexOf(":")
  if (separator <= 0 || separator === nameAndTag.length - 1) {
    throw new Error("GHCR reference must contain an explicit tag")
  }
  const repository = nameAndTag.slice(0, separator)
  const tag = nameAndTag.slice(separator + 1)
  if (!repository.includes("/") || repository.split("/").some(part => !part || part !== part.toLowerCase())) {
    throw new Error("GHCR repository path must be a lowercase owner/package path")
  }
  if (!TAG.test(tag)) throw new Error("GHCR tag is invalid")
  return { repository, tag }
}

async function readJson(response, purpose) {
  const text = await response.text()
  if (text.length > 1_048_576) throw new Error(`${purpose} response is unexpectedly large`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${purpose} response is not valid JSON`)
  }
}

function manifestUrl(origin, repository, tag) {
  const encodedRepository = repository.split("/").map(encodeURIComponent).join("/")
  return `${origin}/v2/${encodedRepository}/manifests/${encodeURIComponent(tag)}`
}

export async function classifyGhcrTag(reference, options = {}) {
  const { repository, tag } = parseGhcrTag(reference)
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch
  const actor = options.actor ?? process.env.GITHUB_ACTOR
  const token = options.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  const origin = options.origin ?? "https://ghcr.io"
  if (typeof fetchImplementation !== "function") throw new Error("fetch is unavailable")
  if (!actor || !token) throw new Error("GITHUB_ACTOR and GH_TOKEN are required for authoritative GHCR inspection")

  const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000)
  const tokenUrl = new URL("/token", origin)
  tokenUrl.searchParams.set("service", "ghcr.io")
  tokenUrl.searchParams.set("scope", `repository:${repository}:${options.allowRepositoryAbsent ? "pull,push" : "pull"}`)
  let tokenResponse
  try {
    tokenResponse = await fetchImplementation(tokenUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString("base64")}`,
      },
      redirect: "error",
      signal,
    })
  } catch (error) {
    throw new Error(`GHCR token request failed without an authoritative tag result: ${error.message}`)
  }
  if (tokenResponse.status !== 200) {
    await tokenResponse.body?.cancel()
    throw new Error(`GHCR token request returned HTTP ${tokenResponse.status}; refusing to classify the tag as absent`)
  }
  const tokenDocument = await readJson(tokenResponse, "GHCR token")
  const bearer = tokenDocument.token ?? tokenDocument.access_token
  if (typeof bearer !== "string" || bearer.length < 16) throw new Error("GHCR token response did not contain a bearer token")

  let manifestResponse
  try {
    manifestResponse = await fetchImplementation(manifestUrl(origin, repository, tag), {
      headers: {
        Accept: ACCEPTED_MANIFEST_TYPES.join(", "),
        Authorization: `Bearer ${bearer}`,
      },
      redirect: "error",
      signal,
    })
  } catch (error) {
    throw new Error(`GHCR manifest request failed without an authoritative tag result: ${error.message}`)
  }

  if (manifestResponse.status === 200) {
    const digest = manifestResponse.headers.get("docker-content-digest")
    const contentType = manifestResponse.headers.get("content-type")?.split(";", 1)[0].trim()
    await manifestResponse.body?.cancel()
    if (!SHA256_DIGEST.test(digest ?? "")) throw new Error("Existing GHCR tag response has no valid Docker-Content-Digest")
    if (!ACCEPTED_MANIFEST_TYPES.includes(contentType ?? "")) throw new Error("Existing GHCR tag response has an unexpected content type")
    return "exists"
  }

  if (manifestResponse.status === 404) {
    const errorDocument = await readJson(manifestResponse, "GHCR manifest error")
    const errors = errorDocument?.errors
    const allowedAbsentCodes = options.allowRepositoryAbsent
      ? new Set(["MANIFEST_UNKNOWN", "NAME_UNKNOWN"])
      : new Set(["MANIFEST_UNKNOWN"])
    if (Array.isArray(errors) && errors.length > 0 && errors.every(error => allowedAbsentCodes.has(error?.code))) {
      return "absent"
    }
    throw new Error(`GHCR returned HTTP 404 without an authoritative ${options.allowRepositoryAbsent ? "MANIFEST_UNKNOWN/NAME_UNKNOWN" : "MANIFEST_UNKNOWN"} response`)
  }

  await manifestResponse.body?.cancel()
  throw new Error(`GHCR manifest request returned HTTP ${manifestResponse.status}; refusing to classify the tag as absent`)
}

async function main() {
  const arguments_ = process.argv.slice(2)
  const allowRepositoryAbsent = arguments_.at(-1) === "--allow-repository-absent"
  if (allowRepositoryAbsent) arguments_.pop()
  if (arguments_.length !== 1) throw new Error("Usage: node scripts/ghcr-tag-state.mjs <ghcr-tag-reference> [--allow-repository-absent]")
  process.stdout.write(`${await classifyGhcrTag(arguments_[0], { allowRepositoryAbsent })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
