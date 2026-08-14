import assert from "node:assert/strict"
import test from "node:test"
import { assertContractPackageLock } from "./pinned-contract-metadata.mjs"

const contractPackage = {
  name: "@lospor/exchange-contract",
  version: "2.0.0",
}

function lock() {
  return {
    name: contractPackage.name,
    version: contractPackage.version,
    packages: {
      "": {
        name: contractPackage.name,
        version: contractPackage.version,
      },
    },
  }
}

test("accepts matching exchange-contract package and lock metadata", () => {
  assert.doesNotThrow(() => assertContractPackageLock(contractPackage, lock()))
})

test("rejects stale top-level or root-package lock metadata", () => {
  for (const mutate of [
    value => { value.name = "@lospor/wrong-contract" },
    value => { value.version = "1.0.0" },
    value => { value.packages[""].name = "@lospor/wrong-contract" },
    value => { value.packages[""].version = "1.0.0" },
  ]) {
    const value = lock()
    mutate(value)
    assert.throws(
      () => assertContractPackageLock(contractPackage, value),
      /package-lock metadata does not match/,
    )
  }
})
