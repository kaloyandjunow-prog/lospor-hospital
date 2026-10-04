// The conflict rules vendoring applies on every upstream import (1.5.0).
//
// The same few files collide on every import, for reasons that never change:
// the appliance renames its packages and links Core from vendor/, keeps its
// own changelog entries between upstream ones, owns its lockfiles, and
// regenerates the OpenAPI it serves. These were resolved by hand, the same way,
// every release. Each rule below says what it keeps and why; a conflict no rule
// covers -- or a rule that meets a case it does not understand -- returns null,
// and vendoring stops for a human. Nothing clinical is ever merged by rule.
//
// Rules work from the three versions of a file (upstream base, appliance,
// upstream target), never from conflict markers, so a rule cannot be fooled by
// how git happened to cut the hunks.

const DEPENDENCY_SECTIONS = new Set(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides"])
const CORE_PACKAGE = "@lospor/core"

export class RuleRefusal extends Error {}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** What a package.json conflict at `path` resolves to, or a refusal. */
function packageJsonPolicy(path, ours, theirs) {
  const where = path.join(".")
  // The appliance's own package identity: @lospor/hospital-web at 1.0.0, not
  // upstream's name and version.
  if (path.length === 1 && (path[0] === "name" || path[0] === "version")) return { value: ours, why: `${where}: appliance identity kept` }
  if (path.length === 2 && DEPENDENCY_SECTIONS.has(path[0])) {
    // Core is linked from vendor/lospor-core, never from upstream's git tag.
    if (path[1] === CORE_PACKAGE) return { value: ours, why: `${where}: vendored Core link kept` }
    // A package the appliance removed stays removed, whatever upstream did to it.
    if (ours === undefined) return { value: undefined, why: `${where}: removed by the appliance, stays removed` }
    if (typeof theirs === "string" || theirs === undefined) return { value: theirs, why: `${where}: upstream version taken` }
  }
  throw new RuleRefusal(`package.json: both sides changed ${where}, and no rule covers it`)
}

function mergeJson(base, ours, theirs, path, notes) {
  if (same(ours, theirs)) return ours
  if (same(base, ours)) return theirs
  if (same(base, theirs)) return ours
  if (isObject(ours) && isObject(theirs) && (base === undefined || isObject(base))) {
    const out = {}
    const keys = [...Object.keys(ours), ...Object.keys(theirs).filter(key => !(key in ours))]
    // A key both sides deleted is absent from both; nothing to do for it.
    for (const key of keys) {
      const value = mergeJson(base?.[key], ours[key], theirs[key], [...path, key], notes)
      if (value !== undefined) out[key] = value
    }
    return out
  }
  const decision = packageJsonPolicy(path, ours, theirs)
  notes.push(decision.why)
  return decision.value
}

export function mergePackageJson(base, ours, theirs) {
  const notes = []
  const oursValue = JSON.parse(ours)
  const merged = mergeJson(JSON.parse(base), oursValue, JSON.parse(theirs), [], notes)
  // The appliance's package identity holds even where it happens to equal
  // upstream's old value, which a plain three-way merge would hand to upstream.
  for (const key of ["name", "version"]) {
    if (key in oursValue && merged[key] !== oursValue[key]) {
      merged[key] = oursValue[key]
      notes.push(`${key}: appliance identity kept`)
    }
  }
  return { text: `${JSON.stringify(merged, null, 2)}\n`, notes }
}

const SECTION = /^## \[([^\]]+)\][^\n]*$/gm

function sections(text) {
  const marks = [...text.matchAll(SECTION)]
  return marks.map((mark, index) => ({
    version: mark[1],
    text: text.slice(mark.index, marks[index + 1]?.index ?? text.length),
  }))
}

/**
 * Upstream's new changelog sections go on top of the appliance's, in
 * upstream's order. The appliance's own sections (its overlay notes between
 * upstream versions) stay where they are, and no existing section is edited.
 */
export function mergeChangelog(base, ours, theirs) {
  const crlf = ours.includes("\r\n")
  const [b, o, t] = [base, ours, theirs].map(text => text.replace(/\r\n/g, "\n"))
  const known = new Set(sections(b).map(section => section.version))
  const present = new Set(sections(o).map(section => section.version))
  const added = sections(t).filter(section => !known.has(section.version) && !present.has(section.version))
  for (const section of sections(t)) {
    if (!known.has(section.version)) continue
    const before = sections(b).find(entry => entry.version === section.version)
    if (before && before.text !== section.text) throw new RuleRefusal(`CHANGELOG.md: upstream edited its existing ${section.version} section`)
  }
  const first = o.search(SECTION)
  if (first === -1) throw new RuleRefusal("CHANGELOG.md: the appliance changelog has no version sections")
  const insert = added.map(section => section.text.endsWith("\n\n") ? section.text : `${section.text.trimEnd()}\n\n`).join("")
  const text = o.slice(0, first) + insert + o.slice(first)
  return {
    text: crlf ? text.replace(/\n/g, "\r\n") : text,
    notes: [`CHANGELOG.md: ${added.length} upstream section(s) added above the appliance's (${added.map(section => section.version).join(", ") || "none"})`],
  }
}

/**
 * Resolve one conflicted file of a vendored source, or return null for a human.
 * `followUp` names what must run after apply for the result to be true.
 */
export function resolveConflict(relativePath, { base, ours, theirs }) {
  try {
    if (relativePath === "package.json") {
      if (base === null || ours === null || theirs === null) return null
      return { ...mergePackageJson(base, ours, theirs), rule: "package-json" }
    }
    if (relativePath === "CHANGELOG.md") {
      if (base === null || ours === null || theirs === null) return null
      return { ...mergeChangelog(base, ours, theirs), rule: "changelog" }
    }
    // The appliance's lockfile describes the appliance's dependency tree; it is
    // kept, then npm install brings it in line with the merged package.json.
    if (relativePath === "package-lock.json") {
      if (ours === null) return null
      return { text: ours, rule: "lockfile", notes: ["package-lock.json: appliance lockfile kept, refreshed by npm install"], followUp: "npm-install" }
    }
    // Generated from the API's routes; regenerated from the merged source.
    if (/^src\/generated\/openapi[\w-]*\.json$/.test(relativePath)) {
      if (theirs === null) return null
      return { text: theirs, rule: "generated", notes: [`${relativePath}: upstream taken, regenerated after apply`], followUp: "openapi-generate" }
    }
    return null
  } catch (error) {
    if (error instanceof RuleRefusal || error instanceof SyntaxError) return null
    throw error
  }
}
