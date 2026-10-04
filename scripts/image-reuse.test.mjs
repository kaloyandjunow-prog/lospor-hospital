import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  IMAGES,
  MAX_AGE_DAYS,
  buildArguments,
  computeFingerprints,
  copiedPaths,
  envName,
  fingerprint,
  previousImages,
} from "./image-reuse.mjs"

const dockerfile = `# syntax=docker/dockerfile:1
ARG NODE_BASE=node:24
FROM \${NODE_BASE} AS build
COPY vendor/lospor-core ./vendor/lospor-core
COPY apps/web/package.json \\
     apps/web/package-lock.json ./apps/web/
COPY --chown=node:node apps/web/ ./apps/web
ADD --checksum=sha256:abc https://example.org/x.tar.gz /tmp/x.tar.gz
COPY --from=build /out /app
FROM nginx
ARG EXTRA
COPY ./infra/nginx/pwa.conf /etc/nginx/conf.d/default.conf
`

test("finds every repository path a Dockerfile copies, and nothing from stages or URLs", () => {
  assert.deepEqual(copiedPaths(dockerfile), [
    "apps/web",
    "apps/web/package-lock.json",
    "apps/web/package.json",
    "infra/nginx/pwa.conf",
    "vendor/lospor-core",
  ])
  assert.throws(() => copiedPaths("COPY apps/*.json ./\n"), /Wildcard COPY source/)
})

test("reads every build argument from the environment, or its default", () => {
  assert.deepEqual(buildArguments(dockerfile, { NODE_BASE: "node:24@sha256:1" }), [["EXTRA", ""], ["NODE_BASE", "node:24@sha256:1"]])
  assert.deepEqual(buildArguments(dockerfile, {}), [["EXTRA", ""], ["NODE_BASE", "node:24"]])
})

const inputs = {
  image: "web", target: undefined, dockerfileBlob: "d1", ignoreBlob: "i1",
  files: ["100644 aaa apps/web/a.ts", "100644 bbb vendor/lospor-core/b.ts"],
  args: [["NODE_BASE", "node:24@sha256:1"]],
  rebuildEpoch: 1,
}

test("the fingerprint moves with every input the build reads", () => {
  const base = fingerprint(inputs)
  assert.match(base, /^[a-f0-9]{64}$/)
  assert.equal(fingerprint({ ...inputs }), base)
  for (const change of [
    { image: "pwa" },
    { target: "runner" },
    { dockerfileBlob: "d2" },
    { ignoreBlob: "i2" },
    { files: ["100644 aaa apps/web/a.ts", "100644 ccc vendor/lospor-core/b.ts"] },
    { files: ["100755 aaa apps/web/a.ts", "100644 bbb vendor/lospor-core/b.ts"] },
    { files: ["100644 aaa apps/web/a.ts"] },
    { args: [["NODE_BASE", "node:24@sha256:2"]] },
    { rebuildEpoch: 2 },
  ]) {
    assert.notEqual(fingerprint({ ...inputs, ...change }), base, JSON.stringify(change))
  }
})

test("this repository fingerprints all ten release images, and the three api targets apart", () => {
  const root = fileURLToPath(new URL("..", import.meta.url))
  const prints = computeFingerprints(root, {})
  assert.deepEqual(prints.map(entry => entry.image), Object.keys(IMAGES))
  assert.equal(prints.length, 10)
  assert.equal(new Set(prints.map(entry => entry.fingerprint)).size, 10)
  assert.equal(envName("curl-worker"), "HOSPITAL_INPUT_FP_CURL_WORKER")
})

const lock = Buffer.from([
  "LOSPOR-HOSPITAL-RELEASE-LOCK-V2",
  "release\t1.4.22\thospital-1.4.22\tc\tlinux/amd64\t2026-10-03T00:00:00.000Z\tu",
  `image\tapi\tghcr.io/o/lospor-hospital-api:1.4.22\tsha256:${"a".repeat(64)}\tsha256:${"b".repeat(64)}\tsha256:${"c".repeat(64)}\tlinux/amd64\tsha256:${"d".repeat(64)}`,
  "",
].join("\n"))

test("previous images come from the lock, by digest, only while the release is young enough", () => {
  const now = new Date("2026-10-10T00:00:00Z")
  assert.deepEqual(previousImages({ lock, publishedAt: "2026-10-04T07:40:31Z", now }), {
    images: [{ name: "api", repository: "ghcr.io/o/lospor-hospital-api", digest: `sha256:${"a".repeat(64)}` }],
    reason: null,
  })
  const old = previousImages({ lock, publishedAt: new Date(now.getTime() - (MAX_AGE_DAYS + 1) * 86_400_000).toISOString(), now })
  assert.deepEqual(old.images, [])
  assert.match(old.reason, /days old/)
  assert.throws(() => previousImages({ lock: Buffer.from("not a lock"), publishedAt: "2026-10-04T00:00:00Z", now }), /not a release lock/)
  assert.throws(() => previousImages({ lock, publishedAt: "yesterday", now }), /not a publication time/)
  assert.throws(() => previousImages({ lock: Buffer.from(lock.toString().replace(`sha256:${"a".repeat(64)}`, "latest")), publishedAt: "2026-10-04T00:00:00Z", now }), /no digest/)
})
