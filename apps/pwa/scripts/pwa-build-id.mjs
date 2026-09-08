import { createHash } from "crypto"

/**
 * The name the service worker's caches are stamped with at export time.
 *
 * Its whole job is to change when anything that could invalidate a cached entry
 * changes, because `activate` retires every cache whose name is not the current
 * one, and an entry no release can retire is an entry that outlives the bug
 * that wrote it.
 *
 * Both inputs are load-bearing, and each covers a case the other misses:
 *
 * - the emitted bundle filenames, so a new app is not served the old files;
 * - the worker's own source, so a change to the caching rules retires the
 *   entries written under the old rules — which is exactly the set a rule
 *   change exists to distrust.
 *
 * The second was missing once, and the cost was concrete: a release that fixed
 * how entries are written could not retire the corrupt ones it existed to
 * replace, because no app source had changed and the name came out identical.
 *
 * Plain JavaScript, and not TypeScript, because the export runs it under bare
 * node during the deployment build.
 *
 * @param {readonly string[]} bundleNames
 * @param {string} workerSource
 * @returns {string}
 */
export function pwaBuildId(bundleNames, workerSource) {
  return createHash("sha256")
    .update([...bundleNames].sort().join("|"))
    .update("\0")
    .update(workerSource)
    .digest("hex")
    .slice(0, 12)
}
