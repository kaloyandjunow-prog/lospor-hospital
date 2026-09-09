import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

const parser = new URL("./parse-operator-state.mjs", import.meta.url)
const parserPath = fileURLToPath(parser)
const clinicalSource = readFileSync(new URL("../apps/api/scripts/appliance-operator-state.ts", import.meta.url), "utf8")
const statusSource = readFileSync(new URL("../apps/status/src/auth.ts", import.meta.url), "utf8")
const shellSource = readFileSync(new URL("./appliance-operator.sh", import.meta.url), "utf8")

test("initialized clinical state needs a generation, not an optional email", () => {
  const result = spawnSync(process.execPath, [parserPath, "clinical"], {
    input: JSON.stringify({ initialized: true, credentialGeneration: 1 }),
    encoding: "utf8",
  })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, "true 1\n")
})

test("Status state transports only generation and pending transaction state", () => {
  const result = spawnSync(process.execPath, [parserPath, "status"], {
    input: JSON.stringify({
      initialized: true,
      generation: 2,
      pending: { transactionId: "123e4567-e89b-12d3-a456-426614174000", generation: 3 },
    }),
    encoding: "utf8",
  })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, "true 2 123e4567-e89b-12d3-a456-426614174000 3\n")
})

test("no operator state endpoint reintroduces contact-email identity", () => {
  for (const source of [clinicalSource, statusSource, shellSource]) {
    assert.doesNotMatch(source, /operatorEmailHash|OPERATOR_EMAIL_HASH/)
  }
})
