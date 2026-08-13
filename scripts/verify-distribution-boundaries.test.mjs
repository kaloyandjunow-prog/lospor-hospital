import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import test from "node:test"
import { distributionBoundaryProblems } from "./distribution-boundaries-lib.mjs"

test("allows deployment sources and empty private-directory sentinels", () => {
  const paths = [
    "compose.yaml",
    ".env.example",
    "backups/.gitkeep",
    "secrets/.gitkeep",
    "infra/secrets/install-runtime-secrets.sh",
  ]
  assert.deepEqual(distributionBoundaryProblems(paths), [])
})

test("allows only the named secret installer source in infra/secrets", () => {
  assert.deepEqual(
    distributionBoundaryProblems(["infra/secrets/runtime-token"]),
    ["infra/secrets/runtime-token is private runtime/test material and must not be tracked"],
  )
})

test("rejects runtime data, credentials and test sessions", () => {
  const paths = [
    ".env",
    "secrets/status/token",
    "backups/lospor.dump",
    ".data/status.sqlite",
    "apps/web/e2e/.auth/user.json",
  ]
  const problems = distributionBoundaryProblems(paths)
  assert.equal(problems.length, 5)
  assert.match(problems.join("\n"), /environment file/)
  assert.match(problems.join("\n"), /private runtime\/test material/)
})

test("rejects a private key regardless of its filename", () => {
  const { privateKey } = generateKeyPairSync("ed25519")
  const contents = new Map([
    ["docs/not-a-secret.txt", privateKey.export({ format: "pem", type: "pkcs8" }).toString()],
  ])
  assert.deepEqual(
    distributionBoundaryProblems(["docs/not-a-secret.txt"], contents),
    ["docs/not-a-secret.txt contains a private key"],
  )
})

test("rejects common database, backup, cookie, and credential artifacts", () => {
  const paths = [
    "backup.sql",
    "tmp/hospital.db",
    "tmp/status.sqlite-wal",
    "tmp/cookies.txt",
    "tmp/operator-credentials.json",
  ]
  const problems = distributionBoundaryProblems(paths)
  assert.equal(problems.length, paths.length)
  for (const path of paths) assert.match(problems.join("\n"), new RegExp(path.replaceAll(".", "\\.")))
})

test("allows a policy-only npmrc but rejects registry credentials", () => {
  assert.deepEqual(
    distributionBoundaryProblems(["apps/pwa/.npmrc"], new Map([["apps/pwa/.npmrc", "legacy-peer-deps=true\n"]])),
    [],
  )
  assert.deepEqual(
    distributionBoundaryProblems([".npmrc"], new Map([[".npmrc", "//npm.pkg.github.com/:_authToken=secret\n"]])),
    [".npmrc contains npm registry credentials or authentication settings"],
  )
})
