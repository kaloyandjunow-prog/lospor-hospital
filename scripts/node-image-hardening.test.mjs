import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const dockerfiles = {
  api: "infra/docker/api.Dockerfile",
  browser: "infra/docker/browser.Dockerfile",
  pwa: "infra/docker/pwa.Dockerfile",
  status: "infra/docker/status.Dockerfile",
  web: "infra/docker/web.Dockerfile",
}

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(dockerfiles).map(async ([name, path]) => [
      name,
      await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
    ]),
  ),
)

test("all Node build arguments default to the approved Alpine line", () => {
  for (const [name, source] of Object.entries(sources)) {
    assert.match(
      source,
      /ARG NODE_[A-Z_]+_BASE_IMAGE=node:24-alpine3\.24/,
      `${name} does not default to node:24-alpine3.24`,
    )
    assert.doesNotMatch(source, /bookworm|apt-get|groupadd|useradd/)
  }
})

test("all Node dependency stages tolerate transient registry failures", () => {
  for (const [name, source] of Object.entries(sources)) {
    assert.match(source, /NPM_CONFIG_FETCH_RETRIES=5/,
      `${name} does not increase npm's bounded fetch retries`)
    assert.match(source, /NPM_CONFIG_FETCH_RETRY_FACTOR=2/,
      `${name} does not use bounded exponential retry delay`)
    assert.match(source, /NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000/,
      `${name} does not define the minimum npm retry delay`)
    assert.match(source, /NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000/,
      `${name} does not define the maximum npm retry delay`)
  }
})

test("Node runtime images remove global npm and Corepack", () => {
  for (const name of ["api", "browser", "status", "web"]) {
    assert.match(sources[name], /FROM \$\{NODE_[A-Z_]+_BASE_IMAGE\} AS runner[\s\S]*rm -rf [^\n]*\/usr\/local\/lib\/node_modules\/npm/)
    assert.match(sources[name], /rm -f [^\n]*\/usr\/local\/bin\/npm/)
    assert.match(sources[name], /\/usr\/local\/bin\/corepack/)
  }
})

test("API migrator and tools inherit hardened local tooling", () => {
  assert.match(sources.api, /FROM builder AS hardened-tooling[\s\S]*\/usr\/local\/lib\/node_modules\/npm/)
  assert.match(sources.api, /FROM hardened-tooling AS migrator/)
  assert.match(sources.api, /FROM hardened-tooling AS tools/)
  assert.match(
    sources.api,
    /ENTRYPOINT \["node", "node_modules\/prisma\/build\/index\.js", "migrate", "deploy"\]/,
  )
  assert.doesNotMatch(sources.api, /ENTRYPOINT \["npx"/)
})
