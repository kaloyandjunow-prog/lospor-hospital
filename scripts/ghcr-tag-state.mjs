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

function encodeRepository(repository) {
  return repository.split("/").map(encodeURIComponent).join("/")
}

function manifestUrl(origin, repository, tag) {
  return `${origin}/v2/${encodeRepository(repository)}/manifests/${encodeURIComponent(tag)}`
}

/**
 * Exchange registry credentials for a short-lived bearer token.
 *
 * Shared by the tag classifier and the update checker so both obtain a token
 * the same way. Every failure throws: a caller must never be able to mistake
 * "the registry would not talk to us" for "the thing you asked about is not
 * there", which is the single most dangerous confusion in this area -- it is
 * what would let an appliance report an up-to-date system because the network
 * was down.
 *
 * Omit `credentials` for an anonymous token, which GHCR issues for public
 * packages only.
 */
export async function requestRegistryToken({ fetchImplementation, origin, repository, scope, credentials, signal }) {
  const tokenUrl = new URL("/token", origin)
  tokenUrl.searchParams.set("service", "ghcr.io")
  tokenUrl.searchParams.set("scope", `repository:${repository}:${scope}`)
  let response
  try {
    response = await fetchImplementation(tokenUrl, {
      headers: {
        Accept: "application/json",
        ...(credentials
          ? { Authorization: `Basic ${Buffer.from(`${credentials.actor}:${credentials.token}`).toString("base64")}` }
          : {}),
      },
      redirect: "error",
      signal,
    })
  } catch (error) {
    throw new Error(`GHCR token request failed without an authoritative tag result: ${error.message}`)
  }
  if (response.status !== 200) {
    await response.body?.cancel()
    throw new Error(`GHCR token request returned HTTP ${response.status}; refusing to classify the tag as absent`)
  }
  const document = await readJson(response, "GHCR token")
  const bearer = document.token ?? document.access_token
  if (typeof bearer !== "string" || bearer.length < 16) {
    throw new Error("GHCR token response did not contain a bearer token")
  }
  return bearer
}

/**
 * Classify a GHCR tag as "exists" or "absent", authoritatively.
 *
 * Two callers, two credential situations. The release workflow inspects its own
 * packages with GITHUB_ACTOR and GH_TOKEN, and must be able to tell an absent
 * repository from an absent tag so a retried release resumes rather than
 * rebuilds. An installed appliance asks whether a newer release has been
 * published, has no GitHub credentials, and must not be given any.
 *
 * Anonymous access is opt-in via `anonymous: true`, and is never inferred from
 * absent credentials. The release workflow has to keep failing loudly when its
 * secrets do not load: an unauthenticated query that happened to succeed would
 * let a credential-less run report on a package it cannot actually write, which
 * is the exact confusion this classifier exists to prevent. Asking for
 * anonymity is a decision a caller states, not an accident it falls into.
 *
 * Forcing it also ignores any credential present in the environment, because an
 * appliance polling for updates should authenticate as nobody -- inheriting a
 * stray GITHUB_TOKEN there would be a bug rather than a convenience.
 */
export async function classifyGhcrTag(reference, options = {}) {
  const { repository, tag } = parseGhcrTag(reference)
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch
  const anonymous = options.anonymous === true
  const actor = anonymous ? undefined : options.actor ?? process.env.GITHUB_ACTOR
  const token = anonymous ? undefined : options.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  const origin = options.origin ?? "https://ghcr.io"
  if (typeof fetchImplementation !== "function") throw new Error("fetch is unavailable")
  if (!anonymous && (!actor || !token)) {
    throw new Error("GITHUB_ACTOR and GH_TOKEN are required for authoritative GHCR inspection")
  }
  // An anonymous registry token carries pull scope only. Distinguishing an
  // absent repository from an absent tag needs push scope, so refuse the
  // combination outright rather than returning a result that cannot mean what
  // the caller asked for.
  if (anonymous && options.allowRepositoryAbsent) {
    throw new Error("Anonymous GHCR inspection cannot distinguish an absent repository; supply credentials")
  }

  const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000)
  const bearer = await requestRegistryToken({
    fetchImplementation,
    origin,
    repository,
    scope: options.allowRepositoryAbsent ? "pull,push" : "pull",
    credentials: anonymous ? undefined : { actor, token },
    signal,
  })

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
