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

/**
 * Does an app's lockfile agree with the core it is actually linked against?
 *
 * Each app depends on core through `file:../../vendor/lospor-core`, and npm
 * records the linked package's version in the lockfile. Nothing keeps that in
 * step: a re-vendor replaces the vendored tree without touching any lockfile,
 * so the recorded version silently describes whatever core was there when the
 * lock was last written.
 *
 * It had drifted four different ways at once -- three apps recording 9.1.1 and
 * the research browser recording 8.5.0, against a vendored 9.2.0. Nothing runs
 * differently for it, because the `file:` link resolves to whatever is on disk.
 * The cost is entirely to the SBOM, which is the artifact that exists to say
 * what a hospital is running.
 *
 * @param {string} app              app directory name, e.g. "api"
 * @param {string} vendoredVersion  version in vendor/lospor-core/package.json
 * @param {string | null} recorded  version the app's lockfile records for it
 * @returns {string | null}
 */
export function linkedCoreVersionProblem(app, vendoredVersion, recorded) {
  if (!recorded) return null
  if (recorded === vendoredVersion) return null
  return `apps/${app}/package-lock.json records linked core ${recorded}, but `
    + `vendor/lospor-core is ${vendoredVersion}.`
}
