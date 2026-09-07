import { describe, expect, it } from "vitest"

import { pwaBuildId } from "../../scripts/pwa-build-id.mjs"

const BUNDLE = ["entry-abc123.js"]
const WORKER = 'const CACHE = `lospor-shell-${BUILD_ID}`'

describe("the service worker's cache name", () => {
  it("changes when the app does", () => {
    expect(pwaBuildId(["entry-abc123.js"], WORKER))
      .not.toBe(pwaBuildId(["entry-def456.js"], WORKER))
  })

  it("changes when the caching rules do", () => {
    // The half that was missing, and the one that costs the most. A release
    // that fixes how entries are written must retire the entries written the
    // old way — otherwise the corrupt entry it exists to replace survives it,
    // on the one device that needed the fix.
    expect(pwaBuildId(BUNDLE, WORKER))
      .not.toBe(pwaBuildId(BUNDLE, `${WORKER}\n// a rule changed`))
  })

  it("stays put when neither does, so a redeploy does not evict a working cache", () => {
    expect(pwaBuildId(BUNDLE, WORKER)).toBe(pwaBuildId(BUNDLE, WORKER))
  })

  it("does not depend on the order the filenames are read in", () => {
    // readdir order is not guaranteed, and an id that drifted with it would
    // throw away every device's cache on a redeploy that changed nothing.
    expect(pwaBuildId(["a.js", "b.js"], WORKER)).toBe(pwaBuildId(["b.js", "a.js"], WORKER))
  })

  it("does not confuse a filename change with a worker change", () => {
    // Without a separator, "ab" + "c" and "a" + "bc" hash alike, and two
    // genuinely different builds could share a cache.
    expect(pwaBuildId(["ab.js"], "c")).not.toBe(pwaBuildId(["a.js"], "bc"))
  })
})
