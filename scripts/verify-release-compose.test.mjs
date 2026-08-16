import assert from "node:assert/strict"
import { before, describe, it } from "node:test"
import {
  assertResolvedComposeContracts,
  assertDigestPinnedBuildArgs,
  composeContractErrors,
  resolveComposeModels,
} from "./verify-release-compose.mjs"

const RELEASE = "1.0.0-compose-test"
const PUBLICATION_TAG = `candidate-${"b".repeat(40)}-12345-${"c".repeat(16)}`
let models

before(() => {
  // Resolve all three real files once. The mutations below happen against deep
  // copies of this resolved model and therefore exercise the same verifier the
  // release workflow runs without editing the repository during a test.
  models = resolveComposeModels({ release: RELEASE, publicationTag: PUBLICATION_TAG })
})

describe("resolved release Compose contract", () => {
  it("accepts the source, publication, and client-runtime models", () => {
    assert.deepEqual(composeContractErrors(models, RELEASE), [])
    assert.doesNotThrow(() => assertResolvedComposeContracts(models, RELEASE))
  })

  it("fails if publication loses a build target", () => {
    const mutated = structuredClone(models)
    delete mutated.publication.services.api.build

    assert.throws(
      () => assertResolvedComposeContracts(mutated, RELEASE),
      /publication service "api" must have a build definition/,
    )
  })

  it("fails if any resolved image uses latest", () => {
    const mutated = structuredClone(models)
    mutated.publication.services.status.image =
      "ghcr.io/kaloyandjunow-prog/lospor-hospital-status:latest"

    assert.throws(
      () => assertResolvedComposeContracts(mutated, RELEASE),
      /publication service "status" uses forbidden latest image/,
    )
  })

  it("fails if the client runtime regains a local build", () => {
    const mutated = structuredClone(models)
    mutated.runtime.services.web.build = structuredClone(models.source.services.web.build)

    assert.throws(
      () => assertResolvedComposeContracts(mutated, RELEASE),
      /runtime service "web" must not retain a build definition/,
    )
  })

  it("fails if a runtime service can pull after verification", () => {
    const mutated = structuredClone(models)
    mutated.runtime.services.api.pull_policy = "missing"

    assert.throws(
      () => assertResolvedComposeContracts(mutated, RELEASE),
      /runtime service "api" must use pull_policy: never/,
    )
  })

  it("requires every release Dockerfile base argument to resolve to an approved digest", () => {
    const digest = suffix => `${suffix}@sha256:${"a".repeat(64)}`
    const environment = {
      NODE_API_BASE_IMAGE: digest("node:24-alpine3.24"),
      NODE_BROWSER_BASE_IMAGE: digest("node:24-alpine3.24"),
      NODE_PWA_BUILD_BASE_IMAGE: digest("node:24-alpine3.24"),
      NODE_STATUS_BASE_IMAGE: digest("node:24-alpine3.24"),
      NODE_WEB_BASE_IMAGE: digest("node:24-alpine3.24"),
      NGINX_PWA_BASE_IMAGE: digest("nginx:1.30.4-alpine"),
      POSTGRES_BASE_IMAGE: digest("postgres:17.11-bookworm"),
      CURL_BASE_IMAGE: digest("curlimages/curl:8.21.0"),
      CADDY_BUILD_BASE_IMAGE: digest("golang:1.26.6-alpine3.24"),
      CADDY_RUNTIME_BASE_IMAGE: digest("caddy:2.11.4-alpine"),
    }
    const publication = structuredClone(models.publication)
    for (const service of ["api", "migrate", "tools"]) publication.services[service].build.args.NODE_API_BASE_IMAGE = environment.NODE_API_BASE_IMAGE
    publication.services.browser.build.args.NODE_BROWSER_BASE_IMAGE = environment.NODE_BROWSER_BASE_IMAGE
    publication.services.pwa.build.args.NODE_PWA_BUILD_BASE_IMAGE = environment.NODE_PWA_BUILD_BASE_IMAGE
    publication.services.pwa.build.args.NGINX_PWA_BASE_IMAGE = environment.NGINX_PWA_BASE_IMAGE
    publication.services.status.build.args.NODE_STATUS_BASE_IMAGE = environment.NODE_STATUS_BASE_IMAGE
    publication.services.web.build.args.NODE_WEB_BASE_IMAGE = environment.NODE_WEB_BASE_IMAGE
    publication.services.postgres.build.args.POSTGRES_BASE_IMAGE = environment.POSTGRES_BASE_IMAGE
    publication.services["delivery-worker"].build.args.CURL_BASE_IMAGE = environment.CURL_BASE_IMAGE
    publication.services.caddy.build.args.CADDY_BUILD_BASE_IMAGE = environment.CADDY_BUILD_BASE_IMAGE
    publication.services.caddy.build.args.CADDY_RUNTIME_BASE_IMAGE = environment.CADDY_RUNTIME_BASE_IMAGE
    assert.doesNotThrow(() => assertDigestPinnedBuildArgs(publication, environment))
    publication.services.pwa.build.args.NGINX_PWA_BASE_IMAGE = "nginx:latest"
    assert.throws(() => assertDigestPinnedBuildArgs(publication, environment), /pwa.*NGINX_PWA_BASE_IMAGE/)
  })

  it("fails if a shared runtime image tag drifts", () => {
    const mutated = structuredClone(models)
    mutated.runtime.services.backup.image = "postgres:latest"

    assert.throws(
      () => assertResolvedComposeContracts(mutated, RELEASE),
      /runtime service "backup" must use ghcr\.io\/kaloyandjunow-prog\/lospor-hospital-postgres:/,
    )
  })

  it("fails if PostgreSQL is exposed on the host", () => {
    const mutated = structuredClone(models)
    mutated.runtime.services.postgres.ports = [{
      mode: "ingress",
      target: 5432,
      published: "5432",
      protocol: "tcp",
    }]

    assert.throws(
      () => assertResolvedComposeContracts(mutated, RELEASE),
      /runtime service "postgres" accidentally publishes PostgreSQL port 5432/,
    )
  })

  it("fails if Status fallback binds beyond host loopback", () => {
    const mutated = structuredClone(models)
    mutated.runtime.services.status.ports[0].host_ip = "0.0.0.0"

    assert.throws(
      () => assertResolvedComposeContracts(mutated, RELEASE),
      /runtime Status must publish only 127\.0\.0\.1:3443/,
    )
  })
})
