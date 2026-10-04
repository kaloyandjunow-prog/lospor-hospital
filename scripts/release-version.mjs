#!/usr/bin/env node
// Release metadata for a Hospital version, in one command (1.5.0).
//
//   node scripts/release-version.mjs apply <X.Y.Z> --justification "<one sentence>"
//        [--policy backup-required|service-compatible] [--date YYYY-MM-DD]
//     After vendoring: writes the version into package.json and the appliance
//     manifest versions (hospital, plus api and core from UPSTREAM_VERSIONS.json),
//     the compatibility row (schema_max = the newest migration), the rollback
//     justification, the client-pin sentence in the release-validation docs
//     (en, bg), and a CHANGELOG draft drawn from the vendored upstream
//     changelogs. The draft is marked; `check` refuses it until it is edited.
//
//   node scripts/release-version.mjs check <X.Y.Z>
//     Everything above agrees with <X.Y.Z> and the vendored versions, and the
//     changelog entry is written, not a draft. Runs in release.yml's metadata
//     job, so a forgotten step fails in seconds instead of after the build.
//
// Replaces the one-off metadata script written by hand for each release.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const DRAFT_MARKER = "<!-- release:version draft: rewrite for operators, then delete this line -->"
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const POLICIES = new Set(["backup-required", "service-compatible"])
const PATHS = {
  package: "package.json",
  upstream: "UPSTREAM_VERSIONS.json",
  manifestVersions: "apps/api/src/lib/hospital/appliance-versions.ts",
  compatibility: "release-compatibility.tsv",
  rollback: "release-rollback-justification.json",
  migrations: "apps/api/prisma/migrations",
  changelog: "CHANGELOG.md",
  validationEn: "docs/release-validation.md",
  validationBg: "docs/release-validation.bg.md",
}
/** Vendored changelogs a draft is drawn from, in the order the notes name them. */
const UPSTREAM_CHANGELOGS = [
  ["Core", "core", "vendor/lospor-core/CHANGELOG.md"],
  ["API", "api", "apps/api/CHANGELOG.md"],
  ["Web", "web", "apps/web/CHANGELOG.md"],
  ["PWA", "pwa", "apps/pwa/CHANGELOG.md"],
  ["Browser", "browser", "apps/browser/CHANGELOG.md"],
]

export class ReleaseVersionError extends Error {}
const refuse = message => { throw new ReleaseVersionError(message) }

export function compareVersions(left, right) {
  const a = VERSION.exec(left) ?? refuse(`'${left}' is not X.Y.Z`)
  const b = VERSION.exec(right) ?? refuse(`'${right}' is not X.Y.Z`)
  for (let i = 1; i <= 3; i++) if (Number(a[i]) !== Number(b[i])) return Number(a[i]) - Number(b[i])
  return 0
}

// ── Text helpers that keep each file's line endings ──────────────────────────
function readText(root, path) {
  const raw = readFileSync(join(root, path), "utf8")
  return { text: raw.replace(/\r\n/g, "\n"), crlf: raw.includes("\r\n") }
}
function writeText(root, path, { text, crlf }) {
  writeFileSync(join(root, path), crlf ? text.replace(/\n/g, "\r\n") : text)
}
function readJson(root, path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"))
}

/** Core, API, Web and PWA grouped by version, the way the notes have always said it. */
export function pinGroups(sources) {
  const groups = []
  for (const [name, key] of [["Core", "core"], ["API", "api"], ["Web", "web"], ["PWA", "pwa"]]) {
    const version = sources[key]?.version ?? refuse(`UPSTREAM_VERSIONS.json has no ${key} version`)
    const group = groups.find(entry => entry.version === version)
    if (group) group.names.push(name)
    else groups.push({ version, names: [name] })
  }
  return groups
}
const list = (names, and) => names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`

export function pinSentence(release, sources, locale) {
  const groups = pinGroups(sources)
  const browser = sources.browser?.version ?? refuse("UPSTREAM_VERSIONS.json has no browser version")
  if (locale === "bg") {
    const pins = groups.map(group => `${list(group.names, "и")} ${group.version}`).join(", а ")
    return `За клиничния кандидат ${release} координираният набор е ${pins}; Browser е ${browser}.`
  }
  const pins = groups.map(group => `${list(group.names, "and")} ${group.version}`).join(" and ")
  return `For the ${release} clinical candidate, the coordinated client pins are ${pins}; Browser is ${browser}.`
}

// Any whitespace between words: the paragraph is rewrapped, so a line can
// break anywhere in the sentence.
const PIN_SENTENCE = {
  en: /For\s+the\s+\d+\.\d+\.\d+\s+clinical\s+candidate,\s+the\s+coordinated\s+client\s+pins\s+are[\s\S]*?;\s+Browser\s+is\s+\d+\.\d+\.\d+\./,
  bg: /За\s+клиничния\s+кандидат\s+\d+\.\d+\.\d+\s+координираният\s+набор\s+е[\s\S]*?;\s+Browser\s+е\s+\d+\.\d+\.\d+\./,
}

/** Rewrap one paragraph to 80 columns; markdown renders it the same. */
function rewrapParagraphAround(text, index) {
  const start = text.lastIndexOf("\n\n", index) + 2
  const endAt = text.indexOf("\n\n", index)
  const end = endAt === -1 ? text.length : endAt
  const words = text.slice(start, end).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ""
  for (const word of words) {
    if (line && `${line} ${word}`.length > 80) { lines.push(line); line = word } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return text.slice(0, start) + lines.join("\n") + text.slice(end)
}

export function replacePinSentence(text, sentence, locale) {
  const match = PIN_SENTENCE[locale].exec(text) ?? refuse(`The release-validation docs (${locale}) no longer contain the client-pin sentence.`)
  const replaced = text.slice(0, match.index) + sentence + text.slice(match.index + match[0].length)
  return rewrapParagraphAround(replaced, match.index)
}

/** Changelog sections strictly after `from` up to and including `to`. */
export function changelogSections(text, from, to) {
  const sections = []
  const heading = /^## \[(\d+\.\d+\.\d+)\][^\n]*\n/gm
  const marks = [...text.matchAll(heading)]
  marks.forEach((mark, index) => {
    const version = mark[1]
    if (compareVersions(version, from) <= 0 || compareVersions(version, to) > 0) return
    const body = text.slice(mark.index + mark[0].length, marks[index + 1]?.index ?? text.length)
    sections.push({ version, body })
  })
  return sections
}

/** The bold lead of each bullet: what changed, without the explanation. */
export function changelogHighlights(body) {
  return [...body.matchAll(/^- \*\*(.+?)\*\*/gm)].map(match => match[1].replace(/\s+/g, " ").trim())
}

export function changelogDraft({ release, date, previousSources, sources, readChangelog }) {
  const lines = [`## [${release}] - ${date}`, "", DRAFT_MARKER, ""]
  const pins = pinGroups(sources).map(group => `${list(group.names, "and")} ${group.version}`).join(" and ")
  const browserFrom = previousSources?.browser?.version
  const browser = sources.browser.version
  lines.push(`Vendors ${pins}; Browser ${browserFrom === browser ? "stays" : "is"} ${browser}.`, "")
  const notes = []
  for (const [label, key, path] of UPSTREAM_CHANGELOGS) {
    const from = previousSources?.[key]?.version
    const to = sources[key]?.version
    if (!from || !to || compareVersions(to, from) <= 0) continue
    for (const section of changelogSections(readChangelog(path), from, to)) {
      for (const highlight of changelogHighlights(section.body)) notes.push(`- ${label} ${section.version}: ${highlight}`)
    }
  }
  if (notes.length > 0) lines.push("### Upstream", "", ...notes, "")
  return `${lines.join("\n")}\n`
}

function newestMigration(root) {
  const names = readdirSync(join(root, PATHS.migrations)).filter(name => /^\d{14}_/.test(name)).sort()
  return names.at(-1) ?? refuse("No migrations found.")
}

function previousSources(root, previousRelease) {
  try {
    const text = execFileSync("git", ["show", `hospital-${previousRelease}:${PATHS.upstream}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return JSON.parse(text).sources
  } catch {
    return null
  }
}

function setManifestVersions(text, { hospital, api, core }) {
  let out = text
  for (const [key, value] of Object.entries({ hospital, api, core })) {
    const pattern = new RegExp(`^(  ${key}: )"[^"]*",$`, "m")
    if (!pattern.test(out)) refuse(`appliance-versions.ts has no ${key} line to set.`)
    out = out.replace(pattern, `$1"${value}",`)
  }
  return out
}

export function apply(root, release, { justification, policy, date, previousPins }) {
  if (!VERSION.test(release)) refuse(`'${release}' is not X.Y.Z`)
  if (!justification || justification.trim().split(/\s+/).length < 4) {
    refuse("Give the rollback justification: --justification \"<one sentence on why this release's rollback policy is what it is>\".")
  }
  const pkg = readJson(root, PATHS.package)
  const previous = pkg.version
  if (previous !== release && compareVersions(release, previous) <= 0) refuse(`${release} is not after the current ${previous}.`)
  const { sources } = readJson(root, PATHS.upstream)

  // package.json: only the version line, so nothing else is reformatted.
  const pkgText = readText(root, PATHS.package)
  pkgText.text = pkgText.text.replace(/^(  "version": )"[^"]*",$/m, `$1"${release}",`)
  writeText(root, PATHS.package, pkgText)

  const manifest = readText(root, PATHS.manifestVersions)
  manifest.text = setManifestVersions(manifest.text, { hospital: release, api: sources.api.version, core: sources.core.version })
  writeText(root, PATHS.manifestVersions, manifest)

  const [header, , schemaMin, , previousPolicy, ...rest] = readText(root, PATHS.compatibility).text.trim().split("\t")
  const chosenPolicy = policy ?? previousPolicy
  if (!POLICIES.has(chosenPolicy)) refuse(`Rollback policy must be one of ${[...POLICIES].join(", ")}.`)
  writeFileSync(join(root, PATHS.compatibility), `${[header, release, schemaMin, newestMigration(root), chosenPolicy, ...rest].join("\t")}\n`)

  const rollback = readJson(root, PATHS.rollback)
  Object.assign(rollback, { release, policy: chosenPolicy, justification: justification.trim(), assessedAt: date })
  writeFileSync(join(root, PATHS.rollback), `${JSON.stringify(rollback, null, 2)}\n`)

  for (const [path, locale] of [[PATHS.validationEn, "en"], [PATHS.validationBg, "bg"]]) {
    const doc = readText(root, path)
    doc.text = replacePinSentence(doc.text, pinSentence(release, sources, locale), locale)
    writeText(root, path, doc)
  }

  const changelog = readText(root, PATHS.changelog)
  if (!changelog.text.includes(`## [${release}]`)) {
    const draft = changelogDraft({
      release, date, sources,
      previousSources: previousPins ?? previousSources(root, previous),
      readChangelog: path => existsSync(join(root, path)) ? readText(root, path).text : "",
    })
    const first = changelog.text.indexOf("\n## [")
    changelog.text = first === -1 ? `${changelog.text.trimEnd()}\n\n${draft}` : `${changelog.text.slice(0, first + 1)}${draft}${changelog.text.slice(first + 1)}`
    writeText(root, PATHS.changelog, changelog)
  }
  return { previous, policy: chosenPolicy }
}

/** Every disagreement between <release> and the metadata, as plain sentences. */
export function check(root, release) {
  const problems = []
  const expect = (ok, message) => { if (!ok) problems.push(message) }
  const { sources } = readJson(root, PATHS.upstream)
  expect(readJson(root, PATHS.package).version === release, `package.json is not ${release}.`)

  const manifest = readText(root, PATHS.manifestVersions).text
  for (const [key, value] of Object.entries({ hospital: release, api: sources.api.version, core: sources.core.version })) {
    expect(manifest.includes(`  ${key}: "${value}",`), `appliance-versions.ts does not declare ${key} ${value}.`)
  }

  const row = readText(root, PATHS.compatibility).text.trim().split("\t")
  expect(row[1] === release, `release-compatibility.tsv describes ${row[1]}, not ${release}.`)
  expect(row[3] === newestMigration(root), `release-compatibility.tsv names schema_max ${row[3]}, not the newest migration.`)
  const rollback = readJson(root, PATHS.rollback)
  expect(rollback.release === release, `release-rollback-justification.json describes ${rollback.release}, not ${release}.`)
  expect(rollback.policy === row[4], `The rollback justification says ${rollback.policy} but the compatibility row says ${row[4]}.`)

  for (const [path, locale] of [[PATHS.validationEn, "en"], [PATHS.validationBg, "bg"]]) {
    const match = PIN_SENTENCE[locale].exec(readText(root, path).text)
    expect(match && match[0].replace(/\s+/g, " ") === pinSentence(release, sources, locale), `${path} does not name the ${release} client pins.`)
  }

  const changelog = readText(root, PATHS.changelog).text
  const top = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)
  expect(top?.[1] === release, `CHANGELOG.md does not open with ${release}.`)
  expect(!changelog.includes(DRAFT_MARKER), "CHANGELOG.md still holds the release:version draft marker: rewrite the entry for operators and delete the marker.")
  return problems
}

function main() {
  const [command, release, ...rest] = process.argv.slice(2)
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const option = name => {
    const index = rest.indexOf(`--${name}`)
    return index === -1 ? undefined : rest[index + 1]
  }
  try {
    if (command === "apply") {
      const date = option("date") ?? new Date().toISOString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) refuse("--date must be YYYY-MM-DD.")
      const result = apply(root, release, { justification: option("justification"), policy: option("policy"), date })
      console.log(`Release metadata set to ${release} (from ${result.previous}); rollback policy ${result.policy}.`)
      console.log("Next: rewrite the CHANGELOG draft for operators, delete its marker, then run:")
      console.log(`  node scripts/release-version.mjs check ${release}`)
      console.log("apps/api/src/lib/hospital/appliance-versions.ts moved the API tree: commit, then restamp with node scripts/stamp-upstream.mjs and commit UPSTREAM_VERSIONS.json.")
    } else if (command === "check") {
      if (!VERSION.test(release ?? "")) refuse("Usage: node scripts/release-version.mjs check <X.Y.Z>")
      const problems = check(root, release)
      if (problems.length > 0) {
        for (const problem of problems) console.error(problem)
        process.exit(1)
      }
      console.log(`Release metadata agrees with ${release}.`)
    } else {
      console.error("Usage: node scripts/release-version.mjs apply <X.Y.Z> --justification \"...\" [--policy p] [--date d]\n       node scripts/release-version.mjs check <X.Y.Z>")
      process.exit(2)
    }
  } catch (error) {
    if (!(error instanceof ReleaseVersionError)) throw error
    console.error(error.message)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
