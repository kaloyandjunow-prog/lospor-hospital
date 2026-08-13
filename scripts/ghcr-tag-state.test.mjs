import assert from "node:assert/strict"
import test from "node:test"
import { classifyGhcrTag, parseGhcrTag } from "./ghcr-tag-state.mjs"

const reference = "ghcr.io/kaloyandjunow-prog/lospor-hospital-api:v1.0.0"
const digest = `sha256:${"a".repeat(64)}`

function jsonResponse(status, value, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

function registryFetch(manifestResponse) {
  const calls = []
  const fetchImplementation = async (url, options) => {
    calls.push({ url: String(url), options })
    if (calls.length === 1) return jsonResponse(200, { token: "registry-bearer-token" })
    return typeof manifestResponse === "function" ? manifestResponse() : manifestResponse
  }
  return { calls, fetchImplementation }
}

test("parses only explicit lowercase GHCR tag references", () => {
  assert.deepEqual(parseGhcrTag(reference), {
    repository: "kaloyandjunow-prog/lospor-hospital-api",
    tag: "v1.0.0",
  })
  for (const invalid of [
    "docker.io/example/image:v1",
    "ghcr.io/Owner/image:v1",
    "ghcr.io/owner/image",
    `ghcr.io/owner/image@${digest}`,
  ]) assert.throws(() => parseGhcrTag(invalid))
})

test("classifies an authenticated GHCR manifest response as existing", async () => {
  const fixture = registryFetch(new Response("{}", {
    status: 200,
    headers: {
      "content-type": "application/vnd.oci.image.manifest.v1+json",
      "docker-content-digest": digest,
    },
  }))
  assert.equal(await classifyGhcrTag(reference, {
    actor: "release-actor",
    token: "github-token-value",
    fetchImplementation: fixture.fetchImplementation,
  }), "exists")
  assert.match(fixture.calls[0].url, /\/token\?service=ghcr\.io&scope=repository%3Akaloyandjunow-prog%2Flospor-hospital-api%3Apull$/)
  assert.match(fixture.calls[1].url, /\/v2\/kaloyandjunow-prog\/lospor-hospital-api\/manifests\/v1\.0\.0$/)
  assert.match(fixture.calls[0].options.headers.Authorization, /^Basic /)
  assert.equal(fixture.calls[1].options.headers.Authorization, "Bearer registry-bearer-token")
})

test("only an authenticated MANIFEST_UNKNOWN 404 is authoritative absence", async () => {
  const fixture = registryFetch(jsonResponse(404, {
    errors: [{ code: "MANIFEST_UNKNOWN", message: "manifest unknown" }],
  }))
  assert.equal(await classifyGhcrTag(reference, {
    actor: "release-actor",
    token: "github-token-value",
    fetchImplementation: fixture.fetchImplementation,
  }), "absent")

  for (const body of [{ message: "Not Found" }, { errors: [{ code: "DENIED" }] }]) {
    const ambiguous = registryFetch(jsonResponse(404, body))
    await assert.rejects(classifyGhcrTag(reference, {
      actor: "release-actor",
      token: "github-token-value",
      fetchImplementation: ambiguous.fetchImplementation,
    }), /without an authoritative MANIFEST_UNKNOWN/)
  }
})

test("repository absence is accepted only in explicit candidate mode", async () => {
  const nameUnknown = () => jsonResponse(404, {
    errors: [{ code: "NAME_UNKNOWN", message: "repository name not known" }],
  })
  let fixture = registryFetch(nameUnknown)
  await assert.rejects(classifyGhcrTag(reference, {
    actor: "release-actor",
    token: "github-token-value",
    fetchImplementation: fixture.fetchImplementation,
  }), /without an authoritative MANIFEST_UNKNOWN/)
  fixture = registryFetch(nameUnknown)
  assert.equal(await classifyGhcrTag(reference, {
    actor: "release-actor",
    token: "github-token-value",
    fetchImplementation: fixture.fetchImplementation,
    allowRepositoryAbsent: true,
  }), "absent")
  assert.match(fixture.calls[0].url, /scope=repository%3Akaloyandjunow-prog%2Flospor-hospital-api%3Apull%2Cpush$/)

  const mixed = registryFetch(jsonResponse(404, {
    errors: [{ code: "NAME_UNKNOWN" }, { code: "DENIED" }],
  }))
  await assert.rejects(classifyGhcrTag(reference, {
    actor: "release-actor",
    token: "github-token-value",
    fetchImplementation: mixed.fetchImplementation,
    allowRepositoryAbsent: true,
  }), /without an authoritative/)
})

test("transient or authorization inspection failures never reach promotion mutation", async () => {
  for (const manifestFailure of [
    () => jsonResponse(401, { errors: [{ code: "UNAUTHORIZED" }] }),
    () => jsonResponse(403, { errors: [{ code: "DENIED" }] }),
    () => jsonResponse(429, { errors: [{ code: "TOOMANYREQUESTS" }] }),
    () => jsonResponse(503, { errors: [{ code: "UNAVAILABLE" }] }),
    () => { throw new Error("simulated DNS failure") },
  ]) {
    let mutated = false
    const fixture = registryFetch(manifestFailure)
    await assert.rejects(async () => {
      const state = await classifyGhcrTag(reference, {
        actor: "release-actor",
        token: "github-token-value",
        fetchImplementation: fixture.fetchImplementation,
      })
      if (state === "absent") mutated = true
    }, /refusing to classify|failed without an authoritative/)
    assert.equal(mutated, false)
  }
})

test("malformed successful inspection fails closed", async () => {
  for (const response of [
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/vnd.oci.image.manifest.v1+json" },
    }),
    new Response("{}", {
      status: 200,
      headers: { "content-type": "text/html", "docker-content-digest": digest },
    }),
  ]) {
    const fixture = registryFetch(response)
    await assert.rejects(classifyGhcrTag(reference, {
      actor: "release-actor",
      token: "github-token-value",
      fetchImplementation: fixture.fetchImplementation,
    }), /no valid Docker-Content-Digest|unexpected content type/)
  }
})
