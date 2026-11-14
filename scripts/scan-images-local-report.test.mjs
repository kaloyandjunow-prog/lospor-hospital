import assert from "node:assert/strict"
import test from "node:test"
import { compare, findingsOf } from "./scan-images-local-report.mjs"

const report = { Results: [{ Vulnerabilities: [
  { VulnerabilityID: "CVE-1", PkgName: "libkrb5-3", Severity: "HIGH", InstalledVersion: "1.21", FixedVersion: "" },
  { VulnerabilityID: "CVE-2", PkgName: "zlib", Severity: "CRITICAL", InstalledVersion: "1.3", FixedVersion: "1.3.1" },
  { VulnerabilityID: "CVE-3", PkgName: "curl", Severity: "MEDIUM" },
] }] }

test("keeps HIGH and CRITICAL findings, per image", () => {
  assert.deepEqual(findingsOf(report, "postgres").map(f => [f.image, f.id, f.pkg]), [["postgres", "CVE-1", "libkrb5-3"], ["postgres", "CVE-2", "zlib"]])
})

test("names the uncovered findings, the unused exceptions and the ones to re-key", () => {
  const exceptions = [
    { release: "1.8.3", image: "postgres", vulnerabilityId: "CVE-1", package: "libkrb5-3" },
    { release: "1.8.3", image: "caddy", vulnerabilityId: "CVE-9", package: "go-jose" },
  ]
  const { uncovered, unused, stale } = compare(findingsOf(report, "postgres"), exceptions, "1.9.0")
  assert.deepEqual(uncovered.map(f => f.id), ["CVE-2"])
  assert.deepEqual(unused.map(e => e.vulnerabilityId), ["CVE-9"])
  assert.deepEqual(stale.map(e => e.vulnerabilityId), ["CVE-1"])
})
