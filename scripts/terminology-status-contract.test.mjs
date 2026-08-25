import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const wrapper = readFileSync(new URL("./terminology-host-operation.sh", import.meta.url), "utf8")
const agent = readFileSync(new URL("./update-agent-loop.sh", import.meta.url), "utf8")
const library = readFileSync(new URL("./terminology-agent-lib.sh", import.meta.url), "utf8")
const compose = readFileSync(new URL("../compose.yaml", import.meta.url), "utf8")

test("Status terminology intent cannot choose a command or path", () => {
  assert.match(library, /LOSPOR-HOSPITAL-TERMINOLOGY-REQUEST-V1/)
  assert.match(library, /\^\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\{0,79\}\$/)
  assert.doesNotMatch(wrapper, /(?:^|\n)\s*eval\s|(?:ba)?sh\s+-c/)
  assert.match(wrapper, /case "\$action" in import\|resume\|rollback\|finalize/)
  assert.match(agent, /scripts\/terminology-host-operation\.sh/)
})

test("the privileged wrapper shares the persistent maintenance lock", () => {
  assert.match(wrapper, /update_io_lock_acquire terminology/)
  assert.match(wrapper, /update_io_lock_release/)
  assert.match(compose, /\.data\/io-mutation\.lock/)
})

test("rollback and finalization use only exact packaged confirmations", () => {
  assert.match(wrapper, /rollback-terminology\.sh" --confirm/)
  assert.match(wrapper, /finalize-terminology\.sh" --confirm-drop-rollback/)
  assert.match(wrapper, /terminology-status\.sh" --go-live/)
  assert.doesNotMatch(wrapper, /\$package.*rollback-terminology|\$package.*finalize-terminology/)
})

test("the Status projection omits raw host and licensed-source details", () => {
  assert.match(library, /terminology-agent\.v1\.json/)
  for (const forbidden of ["sourcePath", "databaseName", "licenceText", "filenames", "credential"]) {
    assert.doesNotMatch(library, new RegExp(`\\"${forbidden}\\"`))
  }
})
