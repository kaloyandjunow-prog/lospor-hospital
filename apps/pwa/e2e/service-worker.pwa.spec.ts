import { expect, test } from "@playwright/test"

/**
 * The served service worker must be able to retire what it has cached.
 *
 * This exists because it could not. The cache names were a hand-written "v4"
 * that no release had ever changed, bundles were served cache-first and never
 * revalidated, and anything with an ok status was stored. One interrupted
 * download put a truncated bundle in a phone's cache under the exact filename
 * the app asks for, and that phone then failed to parse it on every visit
 * afterwards — no splash, no error, a black screen — while the same build
 * loaded correctly for everyone else and in a private window.
 *
 * Nothing could reach that phone. Every later release served the same cache
 * names, so nothing retired the entry, and the storage it sat in is not cleared
 * by clearing cookies. The build id below is what makes a deploy able to fix a
 * device it has already broken.
 */
test.describe("the service worker", () => {
  test("names its caches after the build, so a deploy retires the old ones", async ({ request }) => {
    const response = await request.get("/sw.js")
    expect(response.status()).toBe(200)
    const source = await response.text()

    expect(source, "the build id placeholder was never stamped").not.toContain("__BUILD_ID__")

    const buildId = /const BUILD_ID = "([0-9a-f]{12})"/.exec(source)?.[1]
    expect(buildId, "sw.js declares no stamped build id").toBeTruthy()

    // Both caches carry it, so activate's "delete everything that is not
    // current" sweep reaches the shell and the bundles alike.
    expect(source).toContain("`lospor-shell-${BUILD_ID}`")
    expect(source).toContain("`lospor-static-${BUILD_ID}`")
  })

  test("holds the cache write open, so closing a tab cannot cut it short", async ({ request }) => {
    // respondWith keeps the worker alive only until the response is returned,
    // which is when the headers arrive and not when the body finishes. A write
    // started after that is unprotected, and leaving during the splash can kill
    // the worker in the middle of it.
    const source = await (await request.get("/sw.js")).text()

    expect(source).toContain("event.waitUntil(storeWhenComplete(")
    // Read to the end and weighed, because a truncated body is still a 200.
    expect(source).toContain("await response.arrayBuffer()")
    expect(source).toContain("declared !== body.byteLength")
  })

  test("steps aside for a diagnostics probe", async ({ request }) => {
    // Without this the diagnostics page compares the cache against itself and
    // calls a corrupt bundle healthy — it did exactly that before the line
    // existed.
    const source = await (await request.get("/sw.js")).text()

    expect(source).toContain('url.searchParams.has("diagnostics")')
  })

  test("stores only a whole first-party response", async ({ request }) => {
    // A 206 is a fragment and an opaque response has a status of 0. Either one
    // kept under the name of a script is a file the app can never parse and,
    // being cache-first, will never fetch again.
    const source = await (await request.get("/sw.js")).text()

    expect(source).toContain('response.status === 200 && response.type === "basic"')
  })

  test("pre-caches every emitted static asset, including lazy chunks", async ({ request }) => {
    const source = await (await request.get("/sw.js")).text()

    expect(source).not.toContain("__STATIC_PRECACHE__")
    const encoded = /const STATIC_PRECACHE = (\[[^\n]+\])/.exec(source)?.[1]
    expect(encoded, "sw.js declares no generated static precache").toBeTruthy()
    const assets = JSON.parse(encoded!) as string[]
    expect(assets.length).toBeGreaterThan(1)
    expect(assets.some(path => path.includes("/_expo/static/js/"))).toBe(true)

    for (const path of assets) {
      expect((await request.get(path)).status(), path).toBe(200)
    }
  })
})

test.describe("an installed offline copy", () => {
  test.use({ serviceWorkers: "allow" })

  test("has the lazy vocabulary chunk before its first offline search", async ({ page, context }) => {
    // Resolve against Playwright's /app/ base URL. The Hospital worker is
    // scoped to /app/; navigating to the origin root can render the fallback
    // HTML but navigator.serviceWorker.ready will never resolve there.
    await page.goto(".")
    expect(new URL(page.url()).pathname).toMatch(/^\/app\//)
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true)

    const lazyJavaScript = await page.evaluate(async () => {
      const initial = new Set(
        [...document.querySelectorAll("script[src]")]
          .map(element => new URL((element as HTMLScriptElement).src).pathname),
      )
      const cacheName = (await caches.keys()).find(name => name.startsWith("lospor-static-"))
      if (!cacheName) return null
      const paths = (await (await caches.open(cacheName)).keys()).map(request => new URL(request.url).pathname)
      return paths.find(path => path.includes("/_expo/static/js/") && !initial.has(path)) ?? null
    })
    expect(lazyJavaScript, "the generated lazy chunk was not installed").toBeTruthy()

    await context.setOffline(true)
    expect(await page.evaluate(async path => (await fetch(path!)).status, lazyJavaScript)).toBe(200)
  })
})
