import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

/**
 * Dependency audit for every package in the bundle, with explicit exceptions.
 *
 * `npm audit` has no allowlist, so a single unfixable advisory turns the whole
 * gate red, and a permanently red gate is one nobody reads. Worse, the only
 * remedy npm offers for the one we have is `--force`, which would downgrade
 * Expo by three SDK versions to silence a denial-of-service in a build-time
 * image parser. That trade is not worth making.
 *
 * So exceptions are named here, one advisory at a time, each with the reason it
 * is survivable and the condition that retires it. Anything not on the list
 * fails, including a new advisory in an already-excepted package.
 */

const root = fileURLToPath(new URL("..", import.meta.url))

const PACKAGES = [
  "vendor/lospor-core",
  "vendor/exchange-contract",
  "apps/api",
  "apps/web",
  "apps/pwa",
  "apps/browser",
  "apps/status",
]

const FAIL_AT = new Set(["high", "critical"])

/**
 * Accepted advisories, keyed by package path then GHSA id.
 *
 * Removal condition is not decoration: when it is met the exception must go,
 * and the audit will start failing again if it does not.
 */
// braces 3.0.3 (GHSA-vfj7-8cjw-p6xm, CVE-2026-93687) is the newest release and
// has no patched version. Every route to it is build-time tooling, and the
// release image scans confirm no shipped image contains it (the tools and
// migrate images strip the API's lint chain in api.Dockerfile).
const BRACES_1_4_22 = (route) => ({
  reason:
    "Accepted by the maintainer for Hospital 1.4.22 only. braces 3.0.3 has no "
    + `patched release; here it is reached only through ${route}, which runs at `
    + "build or lint time and is not part of any shipped image.",
  removeWhen: "braces publishes a patched version; re-audit before the next Hospital release",
})

const EXCEPTIONS = {
  "apps/api": {
    "GHSA-vfj7-8cjw-p6xm": BRACES_1_4_22("eslint-config-next (lint)"),
  },
  "apps/web": {
    "GHSA-vfj7-8cjw-p6xm": BRACES_1_4_22("@ducanh2912/next-pwa (service-worker generation during the production build)"),
  },
  "apps/browser": {
    "GHSA-vfj7-8cjw-p6xm": BRACES_1_4_22("eslint-config-next (lint)"),
  },
  "apps/pwa": {
    "GHSA-vfj7-8cjw-p6xm": BRACES_1_4_22("tailwindcss (style build)"),
    "GHSA-86w9-cpqp-85rv": {
      reason:
        "Accepted for Hospital 1.4.22 only (re-audited 2026-10-03: node-forge "
        + "1.4.0 is still the newest release, and the PWA moved to Expo "
        + "56.0.23 without dropping it). node-forge 1.4.0 is pulled "
        + "transitively by Expo's code-signing certificates tooling; the PWA "
        + "source has no node-forge import, and the production PWA is a static "
        + "export rather than a runtime that verifies RSA signatures. GitHub "
        + "lists no patched node-forge version, so the only available npm "
        + "remedy would replace the reviewed Expo toolchain without a safe "
        + "target. This is a build-time, unreachable dependency in this "
        + "appliance release, not an assertion that the cryptographic flaw is "
        + "harmless.",
      removeWhen:
        "node-forge publishes a patched version, or Expo drops/replaces the "
        + "dependency; re-audit before the next Hospital release",
    },
  },

  // No other package advisories are currently accepted; a new advisory in any
  // package must still fail the gate.
  //
  // Three lived here until 2026-09-06 and all three had retired without
  // anybody noticing:
  //
  //   - apps/api GHSA-ggr8-5vv4-36mx (deepmerge-ts stack exhaustion) — the
  //     `deepmerge-ts: ^8.0.1` override in apps/api already satisfied its own
  //     removal condition.
  //   - apps/pwa GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq (image-size
  //     parser loops) — no longer reachable in the tree metro resolves.
  //
  // The reasoning they carried is recorded in the 1.3.0 tracker under Stage 6b.
  // Not in release-inputs.json's vulnerabilityReview: that one is about the
  // source-built PostgreSQL, zlib and ACL components, which is a different
  // question from an npm advisory and must not become a dumping ground for one.
}

// Same shape as run-all.mjs: prefer the npm CLI script through this Node, which
// avoids caring whether the executable on PATH is `npm` or `npm.cmd`.
const npmExecPath = process.env.npm_execpath
const [command, leadingArgs] = npmExecPath
  ? [process.execPath, [npmExecPath]]
  : [process.platform === "win32" ? "npm.cmd" : "npm", []]

function auditPackage(prefix) {
  let raw
  try {
    raw = execFileSync(command, [...leadingArgs, "audit", "--prefix", prefix, "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1 << 28,
    })
  } catch (error) {
    // npm exits non-zero whenever anything was found; the report is still on stdout.
    raw = error.stdout
    if (!raw) throw error
  }
  return JSON.parse(raw)
}

/** Every distinct GHSA id behind a vulnerability entry. */
function advisoryIds(vulnerability) {
  const ids = new Set()
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "object" && typeof via.url === "string") {
      const match = via.url.match(/GHSA-[\w-]+/)
      if (match) ids.add(match[0])
    }
  }
  return ids
}

const problems = []
const excepted = []
/** `prefix\0id` for every exception an advisory actually needed. */
const used = new Set()

for (const prefix of PACKAGES) {
  const report = auditPackage(prefix)
  const allowed = EXCEPTIONS[prefix] ?? {}

  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    if (!FAIL_AT.has(vulnerability.severity)) continue

    const ids = advisoryIds(vulnerability)
    // A transitive entry carries no advisory of its own; it is only vulnerable
    // because something it depends on is. Judge those by their root cause.
    if (ids.size === 0) continue

    const unexcepted = [...ids].filter(id => !(id in allowed))
    for (const id of ids) if (id in allowed) used.add(`${prefix}\0${id}`)
    if (unexcepted.length === 0) {
      excepted.push(`${prefix}: ${name} (${[...ids].join(", ")})`)
      continue
    }
    problems.push(`${prefix}: ${name} ${vulnerability.severity} — ${unexcepted.join(", ")}`)
  }
}

for (const line of excepted) console.log(`  accepted  ${line}`)

// An exception that no advisory needed has outlived its reason.
//
// The comment at the top of this file promises that a met removal condition
// makes the audit fail until the exception goes. It did not: nothing looked,
// so a retired advisory left its excuse behind and the next reader inherited
// a list describing a tree that no longer exists. Three were stale when this
// was written, two of them for an advisory that had been fixed upstream.
//
// An accepted risk is a claim about today. Making the gate check that the
// claim is still load-bearing is what stops the list becoming folklore.
for (const [prefix, allowed] of Object.entries(EXCEPTIONS)) {
  for (const id of Object.keys(allowed)) {
    if (used.has(`${prefix}\0${id}`)) continue
    problems.push(
      `${prefix}: exception ${id} is no longer needed — remove it`
      + ` (it was kept until: ${allowed[id].removeWhen})`,
    )
  }
}

if (problems.length) {
  console.error("\nDependency audit failed:")
  for (const line of problems) console.error(`  - ${line}`)
  console.error(
    "\nFix it, or add an exception to scripts/audit-packages.mjs with a reason"
    + " and the condition that retires it.",
  )
  process.exit(1)
}

console.log(`\nDependency audit clean across ${PACKAGES.length} packages.`)
