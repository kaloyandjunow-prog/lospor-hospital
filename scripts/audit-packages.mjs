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
const EXCEPTIONS = {
  "apps/pwa": {
    "GHSA-w3rx-r6r6-pgpr": {
      reason:
        "image-size ICNS parser infinite loop. Reached only through metro, the "
        + "Expo bundler. Every published version of image-size is affected, so "
        + "no upgrade exists; npm's only remedy is downgrading Expo to 53. The "
        + "PWA runtime image is nginx serving the exported dist, and the "
        + "builder stage that contains metro is discarded, so this code is "
        + "never present in a hospital. It parses repository assets at build "
        + "time, not user input.",
      removeWhen: "image-size publishes a patched release, or Expo's metro drops it",
    },
    "GHSA-5p2g-fcmc-qvqq": {
      reason:
        "image-size JXL and HEIF parser infinite loops. Same dependency, same "
        + "build-only reach, same absence of any patched version.",
      removeWhen: "image-size publishes a patched release, or Expo's metro drops it",
    },
  },
  "apps/api": {
    "GHSA-ggr8-5vv4-36mx": {
      reason:
        "deepmerge-ts stack exhaustion when merging recursive object graphs. "
        + "Reached only through prisma -> @prisma/config, which reads "
        + "prisma.config.ts when the CLI runs a migration or generates a client. "
        + "That input is a configuration file this repository authors and ships: "
        + "never user input, and never present in the serving runtime. An "
        + "attacker able to write it in order to crash a build already has "
        + "filesystem access to the appliance, at which point stack exhaustion "
        + "in a CLI is not the problem worth solving. "
        + "Every deepmerge-ts below 8.0.0 is affected, and npm's only remedy is "
        + "downgrading Prisma from 7.9.1 to 6.12.0 -- a major version backwards "
        + "across the schema, the client and the migration engine. That trade is "
        + "considerably worse than the advisory.",
      removeWhen: "@prisma/config depends on deepmerge-ts 8 or later, or drops it",
    },
  },
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
    if (unexcepted.length === 0) {
      excepted.push(`${prefix}: ${name} (${[...ids].join(", ")})`)
      continue
    }
    problems.push(`${prefix}: ${name} ${vulnerability.severity} — ${unexcepted.join(", ")}`)
  }
}

for (const line of excepted) console.log(`  accepted  ${line}`)

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
