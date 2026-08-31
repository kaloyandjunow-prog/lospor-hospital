/**
 * Keeps version metadata from drifting into a lie.
 *
 * Compose and the backup scripts stamp four version values into every backup
 * manifest and Central exchange envelope: the appliance release, the backup
 * tool version, the exchange contract version and the data dictionary version.
 * Each was written as `${VAR:-<literal>}`, and three of those literals were
 * still `1.2.1` while the repository shipped 1.2.2 -- so a run that reached the
 * fallback stamped a release the appliance was not, into provenance metadata
 * nobody re-reads until an audit or a restore.
 *
 * Nothing caught it, because a stale literal is still a valid string. The
 * host-side path had it right all along (`backup-now.sh` falls back to the
 * version in package.json), which is exactly why the compose defaults were easy
 * to miss: the drift only appears when a service starts without the launcher.
 *
 * Two rules, matching the two kinds of value:
 *
 *   - The appliance release and the backup tool version must never carry a
 *     semver literal. They default to `source`, which is what the rest of the
 *     tree already uses to mean "not a published release" -- self-evidently not
 *     a version rather than plausibly the wrong one.
 *   - The exchange contract and data dictionary versions legitimately are
 *     literals, because they track a pinned contract. They must equal the
 *     version recorded in UPSTREAM_VERSIONS.json, so bumping the contract
 *     without updating compose fails here instead of in a hospital's manifest.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

/** Must default to `source`; a semver literal here goes stale every release. */
const MUST_NOT_PIN = new Set([
  "HOSPITAL_RELEASE",
  "HOSPITAL_APPLIANCE_RELEASE",
  "HOSPITAL_BACKUP_TOOL_VERSION",
])

/** Must equal UPSTREAM_VERSIONS.sources.exchangeContract.version. */
const MUST_MATCH_CONTRACT = new Set([
  "HOSPITAL_EXCHANGE_CONTRACT_VERSION",
  "HOSPITAL_DATA_DICTIONARY_VERSION",
])

const manifest = JSON.parse(readFileSync(join(root, "UPSTREAM_VERSIONS.json"), "utf8"))
const contractVersion = manifest.sources?.exchangeContract?.version
if (!contractVersion) {
  throw new Error("UPSTREAM_VERSIONS.json does not record an exchangeContract version")
}

function shellFiles(dir) {
  const found = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...shellFiles(full))
    } else if (entry.endsWith(".sh") && !entry.endsWith(".test.sh")) {
      found.push(full)
    }
  }
  return found
}

const targets = [join(root, "compose.yaml"), ...shellFiles(join(root, "infra")), ...shellFiles(join(root, "scripts"))]

// ${VAR:-default}, capturing a default that looks like a version number.
const DEFAULTED = /\$\{([A-Z_][A-Z0-9_]*):-([^}]*)\}/g
const SEMVER = /^\d+\.\d+\.\d+/

const problems = []
for (const file of targets) {
  let content
  try {
    content = readFileSync(file, "utf8")
  } catch {
    continue
  }
  const where = relative(root, file).replace(/\\/g, "/")
  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const match of line.matchAll(DEFAULTED)) {
      const [, name, fallback] = match
      // Nested defaults such as ${A:-${B:-source}} are read by the inner match.
      if (fallback.includes("${")) continue
      if (MUST_NOT_PIN.has(name) && SEMVER.test(fallback)) {
        problems.push(
          `${where}:${index + 1}: ${name} defaults to the literal "${fallback}". `
          + "It is stamped into backup provenance and goes stale every release -- default it to `source`.",
        )
      }
      // Only literal pins can go stale. An empty default, or one deferring to
      // another variable, means "resolved elsewhere" and is not this gate's
      // business.
      if (MUST_MATCH_CONTRACT.has(name) && SEMVER.test(fallback) && fallback !== contractVersion) {
        problems.push(
          `${where}:${index + 1}: ${name} defaults to "${fallback}" but UPSTREAM_VERSIONS.json `
          + `pins the exchange contract at "${contractVersion}".`,
        )
      }
    }
  })
}

if (problems.length) {
  throw new Error(`Version default verification failed:\n  - ${problems.join("\n  - ")}`)
}

console.log(`Version defaults OK: release metadata falls back to \`source\`, contract versions match ${contractVersion}.`)
