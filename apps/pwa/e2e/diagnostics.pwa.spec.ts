import { expect, test } from "@playwright/test"

/**
 * The page a broken phone can still open.
 *
 * It exists because a device that will not start the app cannot be asked what
 * is wrong with it: Android Chrome has no console, a static host has no request
 * log, and the failure it was built for shows nothing — no splash, no error, a
 * black screen, on a build that loads correctly everywhere else.
 *
 * Which is why it must not load any app code. If the instrument fails the way
 * the patient does, it measures nothing, so this checks it renders a report
 * without the bundle rather than merely that the file is served.
 */
test.describe("the diagnostics page", () => {
  test("reports without loading any app code", async ({ page }) => {
    const bundleRequests: string[] = []
    page.on("request", request => {
      if (request.url().includes("/_expo/static/js/")) bundleRequests.push(request.url())
    })

    await page.goto("/diagnostics.html")
    const report = page.locator("#report")

    await expect(report).toContainText("--- SERVICE WORKER ---")
    await expect(report).toContainText("--- CACHED BUNDLES ---")
    await expect(report).not.toContainText("The report itself failed")

    // Nothing but its own three files: a report that needs the bundle is a
    // report a broken device cannot read.
    expect(bundleRequests).toEqual([])
  })

  test("offers the repair, since clearing cookies does not reach Cache Storage", async ({ page }) => {
    await page.goto("/diagnostics.html")

    await expect(page.getByRole("button", { name: "Reset this device" })).toBeVisible()
  })
})
