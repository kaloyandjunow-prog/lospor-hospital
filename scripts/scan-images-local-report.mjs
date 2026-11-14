// The report half of scripts/scan-images-local.sh (Hospital 1.9.0).
//
//   node scripts/scan-images-local-report.mjs <X.Y.Z> <exceptions.json> <out-dir> <ten-trivy-reports.json>
//
// Compares the local scan with the recorded exceptions, ignoring which release
// each was recorded for, writes <out-dir>/findings.tsv and a re-keyed copy of
// the exceptions, then runs release.yml's policy check on that copy.
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { pathToFileURL } from "node:url"

export function findingsOf(report, image) {
  const out = []
  for (const result of report.Results ?? []) {
    for (const v of result.Vulnerabilities ?? []) {
      if (v.Severity !== "HIGH" && v.Severity !== "CRITICAL") continue
      out.push({ image, id: v.VulnerabilityID, pkg: v.PkgName, severity: v.Severity, installed: v.InstalledVersion ?? "", fixed: v.FixedVersion ?? "", title: (v.Title ?? "").slice(0, 80) })
    }
  }
  return out
}

export function compare(findings, exceptions, release) {
  const key = value => `${value.image}\t${value.vulnerabilityId ?? value.id}\t${value.package ?? value.pkg}`
  const recorded = new Map(exceptions.map(exception => [key(exception), exception]))
  const found = new Map(findings.map(finding => [key(finding), finding]))
  return {
    uncovered: findings.filter(finding => !recorded.has(key(finding))),
    unused: exceptions.filter(exception => !found.has(key(exception))),
    stale: exceptions.filter(exception => found.has(key(exception)) && exception.release !== release),
  }
}

function main() {
  const [release, exceptionsPath, outDir, ...reports] = process.argv.slice(2)
  if (!release || !exceptionsPath || !outDir || reports.length !== 10) {
    throw new Error("Usage: node scripts/scan-images-local-report.mjs <X.Y.Z> <exceptions.json> <out-dir> <ten-trivy-reports.json>")
  }
  const policy = JSON.parse(readFileSync(exceptionsPath, "utf8"))
  const findings = reports.flatMap(path => findingsOf(JSON.parse(readFileSync(path, "utf8")), basename(path, ".json")))
  const { uncovered, unused, stale } = compare(findings, policy.exceptions, release)

  writeFileSync(join(outDir, "findings.tsv"), ["image\tid\tpackage\tseverity\tinstalled\tfixed\ttitle",
    ...findings.map(f => [f.image, f.id, f.pkg, f.severity, f.installed, f.fixed || "-", f.title].join("\t"))].join("\n") + "\n")

  const byImage = new Map()
  for (const finding of findings) byImage.set(finding.image, (byImage.get(finding.image) ?? 0) + 1)
  console.log(`\nHIGH/CRITICAL findings: ${findings.length} (${[...byImage].map(([image, n]) => `${image} ${n}`).join(", ") || "none"})`)
  console.log(`Not covered by an exception: ${uncovered.length}`)
  for (const f of uncovered) console.log(`  ${f.image}\t${f.id}\t${f.pkg} ${f.installed}\t${f.fixed ? `FIX: ${f.fixed}` : "no fix"}\t${f.title}`)
  console.log(`Exceptions no finding needs (remove them): ${unused.length}`)
  for (const e of unused) console.log(`  ${e.image}\t${e.vulnerabilityId}\t${e.package}`)
  console.log(`Exceptions still recorded for an older release (re-key to ${release}): ${stale.length}`)

  // release.yml's own check, on the exceptions as they would be for <release>.
  const rekeyed = join(outDir, "risk-exceptions.rekeyed.json")
  writeFileSync(rekeyed, `${JSON.stringify({ ...policy, exceptions: policy.exceptions.filter(e => !unused.includes(e)).map(e => ({ ...e, release })) }, null, 2)}\n`)
  const check = spawnSync(process.execPath, ["scripts/verify-vulnerability-policy.mjs", release, rekeyed, ...reports], { encoding: "utf8" })
  process.stdout.write(check.stdout)
  process.stderr.write(check.stderr)
  console.log(check.status === 0
    ? `\nPolicy check passes for ${release} with the re-keyed exceptions (${rekeyed}).`
    : `\nPolicy check FAILS for ${release}: fix or record the findings above before cutting a candidate.`)
  process.exitCode = check.status === 0 ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
