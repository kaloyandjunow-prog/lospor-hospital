import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { assertCrossAppCiContract } from "./crossapp-ci-contract.mjs"

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8")
const scenario = await readFile(
  new URL("../e2e/intraop-across-apps.crossapp.spec.ts", import.meta.url),
  "utf8",
)

test("the owner Web release gate executes the exact two-client intraoperative scenario", () => {
  assert.equal(assertCrossAppCiContract(workflow), true)
})

test("the selected scenario still contains the exact one-hour two-client proof", () => {
  assert.match(scenario, /Web and PWA alternate across an hour boundary/)
  assert.match(scenario, /phoneContext\.request/)
  assert.match(scenario, /web\.request/)
  assert.match(scenario, /60 \* 60 \* 1_000/)
  assert.match(scenario, /CASE_EVENT_ADD/)
  assert.match(scenario, /print-data/)
  assert.match(scenario, /\/finalize/)
})

test("the release gate rejects missing companion, database, scenario, or fail-closed behavior", () => {
  const unsafe = [
    workflow.replace("repository: kaloyandjunow-prog/lospor-mobile", "repository: example/omitted-mobile"),
    workflow.replace("npx prisma migrate deploy", "true # migration omitted"),
    workflow.replace(
      "npm run e2e:crossapp -- e2e/intraop-across-apps.crossapp.spec.ts",
      "npx playwright test --list",
    ),
    workflow.replace(
      "run: npm run e2e:crossapp -- e2e/intraop-across-apps.crossapp.spec.ts",
      "continue-on-error: true\n        run: npm run e2e:crossapp -- e2e/intraop-across-apps.crossapp.spec.ts",
    ),
  ]

  for (const candidate of unsafe) {
    assert.throws(() => assertCrossAppCiContract(candidate))
  }
})
