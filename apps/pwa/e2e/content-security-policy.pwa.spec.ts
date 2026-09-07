import { expect, test } from "@playwright/test"

/**
 * The deployed Content-Security-Policy must let the app render.
 *
 * This exists because a policy that blanked pwa.lospor.org shipped and stayed
 * live: `style-src-elem 'self'` with no 'unsafe-inline', against a
 * react-native-web StyleSheet that is built at runtime and so can be neither
 * hashed nor served from a file. Every gate was green, because the suite's own
 * static server sent no CSP at all — the one header that mattered was the one
 * nothing tested.
 *
 * The failure has no error to find, which is why it survived. The bundle loads,
 * nothing throws, no request fails, and a static host has no logs to look at.
 * The app simply renders an empty root on a dark background.
 *
 * So this asserts the two halves separately: that nothing is refused, and that
 * something is actually on the screen. Either alone would have passed.
 */
test.describe("the deployed policy", () => {
  test("refuses nothing the app needs, and the app renders", async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __cspRefusals: string[] }).__cspRefusals = []
      addEventListener("securitypolicyviolation", event => {
        ;(window as unknown as { __cspRefusals: string[] }).__cspRefusals.push(
          `${event.effectiveDirective} refused ${event.blockedURI}`,
        )
      })
    })

    const response = await page.goto("/")
    expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'")

    // Rendered, not merely mounted: the root container is present even when
    // every style below it has been refused.
    await expect(page.getByText("LOSPOR")).toBeVisible()

    expect(
      await page.evaluate(() => (window as unknown as { __cspRefusals: string[] }).__cspRefusals),
    ).toEqual([])
  })
})
