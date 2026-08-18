/**
 * Does a vendored tree's own package.json contradict the version pinned for it?
 *
 * `verify-upstream.mjs` compares git tree ids, which proves a vendored path has
 * not drifted since it was pinned. It cannot prove the path holds the version
 * the manifest claims, because `stamp:upstream` records whatever is there — a
 * partial re-vendor is stamped just as happily as a complete one. That is not
 * hypothetical: core was vendored at 9.1.0 content and recorded as 9.1.1, and
 * every gate passed because the tree id matched the tree that was really there.
 *
 * Only sources that keep their upstream identity can be checked this way. The
 * appliance re-identifies its four app trees as private `@lospor/hospital-*`
 * packages carrying a placeholder version, precisely because they are no longer
 * the upstream package; their package.json says nothing about what was vendored
 * and must not be read as if it did.
 */

export const HOSPITAL_PACKAGE_PREFIX = "@lospor/hospital-"

/**
 * @param {string} name        source key in UPSTREAM_VERSIONS.json
 * @param {{path?: string, version?: string}} source  the pinned source entry
 * @param {{name?: string, version?: string} | null} vendored  parsed package.json
 * @returns {string | null} a problem description, or null when consistent
 */
export function vendoredVersionProblem(name, source, vendored) {
  if (!vendored) return null
  if (typeof vendored.name === "string"
    && vendored.name.startsWith(HOSPITAL_PACKAGE_PREFIX)) return null
  if (!vendored.version) return null
  if (vendored.version === source.version) return null

  return `${name}: ${source.path}/package.json says ${vendored.version}, pinned `
    + `${source.version}. The vendored tree is not the version this bundle claims.`
}
