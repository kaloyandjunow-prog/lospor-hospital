import { expect, test } from "@playwright/test"

/**
 * The app repairs itself, so that nobody has to know how.
 *
 * A cached bundle that cannot be parsed gives a clinician nothing to act on: no
 * splash, no error, a black screen, on a build that works everywhere else.
 * Recovery meant clearing storage that cannot be reached from the app, on a
 * device with no console. At 2am that is not a recovery, it is a clinician
 * giving up and documenting on paper.
 *
 * Both halves matter equally and are tested apart. A watchdog that never fires
 * is decoration; one that fires on a healthy app throws away good caches, and
 * on a slow connection would do it repeatedly.
 */
const POISON = async (page: import("@playwright/test").Page) => {
  const bundle = await page.evaluate(() =>
    [...document.querySelectorAll("script[src]")].map(s => (s as HTMLScriptElement).src)
      .find(s => s.includes("/_expo/static/js/")))
  expect(bundle, "no app bundle on the page to poison").toBeTruthy()
  await page.evaluate(async url => {
    const name = (await caches.keys()).find(k => k.startsWith("lospor-static-"))
    const cache = await caches.open(name!)
    const whole = await (await fetch(url!)).text()
    await cache.put(url!, new Response(whole.slice(0, whole.length >> 1),
      { status: 200, headers: { "Content-Type": "text/javascript" } }))
  }, bundle)
}

test.describe("the boot watchdog", () => {
  test("does nothing at all when the app starts", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("LOSPOR")).toBeVisible()
    await page.waitForTimeout(9000)

    // Still the app, and its caches are intact: a watchdog that clears a
    // healthy device costs every visit a re-download.
    await expect(page.getByText("LOSPOR")).toBeVisible()
    expect(await page.evaluate(() => caches.keys())).not.toHaveLength(0)
    expect(await page.evaluate(() => sessionStorage.getItem("lospor-boot-repair-attempted")))
      .toBeNull()
  })

  test("brings back an app whose cached bundle cannot be parsed", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("LOSPOR")).toBeVisible()
    await POISON(page)

    // From here nobody touches anything. This is the whole point: the clinician
    // is not asked to know about caches, or to find a diagnostics URL.
    await page.goto("/")
    await expect(page.getByText("LOSPOR")).toBeVisible({ timeout: 30_000 })

    expect(await page.evaluate(() => document.getElementById("root")?.childElementCount ?? 0))
      .toBeGreaterThan(0)

    // Proof the watchdog is what brought it back. Without this the test also
    // passes when the poisoning quietly failed to take, which would leave the
    // whole mechanism untested while reporting green.
    expect(await page.evaluate(() => sessionStorage.getItem("lospor-boot-repair-attempted")))
      .toBe("1")
  })

  test("keeps queued clinical work while it repairs", async ({ page }) => {
    // The trade it must never make. Patches waiting to sync live in
    // localStorage and the local case store in IndexedDB; only Cache Storage is
    // ever cleared. Losing a case to fix a rendering fault would be far worse
    // than the fault.
    await page.goto("/")
    await expect(page.getByText("LOSPOR")).toBeVisible()
    await page.evaluate(() => localStorage.setItem("a-queued-patch", "must survive"))
    await POISON(page)

    await page.goto("/")
    await expect(page.getByText("LOSPOR")).toBeVisible({ timeout: 30_000 })

    expect(await page.evaluate(() => localStorage.getItem("a-queued-patch"))).toBe("must survive")
  })
})
