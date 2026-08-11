import { test, expect, type BrowserContext, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { contextFor, JSON_HEADERS, BASE_URL } from "./roles"

/**
 * A page the onboarding tour will never open on.
 *
 * `stabilise()` also sets `tourCompleted`, but it runs after navigation, and the
 * tour starts on a `setTimeout`. Whether the modal is on screen when the
 * screenshot fires therefore depends on whether that timer has already elapsed:
 * two CI runs of identical code produced one dashboard with the tour open over
 * it and one without. Setting the flag in an init script runs it before any page
 * script, so the tour never starts and the comparison has one answer.
 */
async function tourFreePage(context: BrowserContext): Promise<Page> {
  await context.addInitScript(() => {
    try { localStorage.setItem("tourCompleted", "1") } catch { /* private mode */ }
  })
  return context.newPage()
}

// Appearance: visual regression + accessibility over the five screens that
// matter most.
//
// Deliberately five, not fifty. A large snapshot baseline becomes a chore nobody
// maintains, and then someone approves a diff without reading it — which is
// worse than having no baseline at all.
//
// These exist because two defects shipped that every other kind of test was
// blind to: an unrounded BMI printed on the anaesthesia record
// ("BMI 26.1224489795918"), and an unstyled light 404 inside a dark app. Unit
// tests, tsc and eslint cannot see either. A screenshot can.
//
// First run writes the baselines; commit them, then a later run compares.
// Re-baseline with `npx playwright test appearance --update-snapshots`.

const PREOP = {
  ageYears: 52, sex: "MALE" as const, heightCm: 175, weightKg: 80,
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
  asaScore: "II" as const,
}

/**
 * Things that legitimately change between runs and would otherwise fail every
 * comparison: clock-driven text, per-run case codes, and the seeded case list.
 */
async function stabilise(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  })
  // The onboarding tour covers the dashboard and steals pointer events.
  await page.evaluate(() => { try { localStorage.setItem("tourCompleted", "1") } catch {} })
}

/**
 * Accessibility debt that exists today, recorded so this check can catch NEW
 * regressions without being permanently red.
 *
 * Measured 9 Aug 2026, first time axe was ever run against this app. These are
 * real and worth paying down — unlabelled inputs and unnamed buttons matter most
 * to exactly the people who most need the app to be forgiving:
 *
 *   login       label(1), button-name(1), color-contrast(4)
 *   not-found   aria-allowed-attr(1)   <- #driver-dummy-element, from the tour library
 *   dashboard   button-name(22), color-contrast(49), aria-progressbar-name(1)
 *   preop form  label(9), button-name(22), color-contrast(28)
 *
 * `button-name` on the preop form is the +/- steppers: icon-only buttons with no
 * accessible name. `label` includes the age input. Both are small fixes with
 * real benefit.
 *
 * An entry here is a promise to remove it, not permission to keep it. Deleting a
 * line and watching this go red is how you verify a fix.
 */
const KNOWN_A11Y_DEBT: Record<string, string[]> = {
  "login":       ["label", "button-name", "color-contrast"],
  "not-found":   ["aria-allowed-attr"],
  "dashboard":   ["button-name", "color-contrast", "aria-progressbar-name", "aria-allowed-attr"],
  "preop form":  ["label", "button-name", "color-contrast", "aria-allowed-attr", "aria-progressbar-name"],
  "case record": ["label", "button-name", "color-contrast", "aria-allowed-attr"],
}

/**
 * Serious and critical only. Moderate/minor findings on a dense clinical grid
 * produce a long list nobody actions, and a check that is always failing is the
 * same as no check.
 */
async function expectNoSeriousA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  const serious = results.violations.filter(v => v.impact === "serious" || v.impact === "critical")
  const allowed = KNOWN_A11Y_DEBT[label] ?? []
  const regressions = serious.filter(v => !allowed.includes(v.id))

  const summary = regressions
    .map(v => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} node(s))\n    ${v.nodes[0]?.target?.join(" ")}`)
    .join("\n  ")

  expect(
    regressions.map(v => v.id),
    `${label} has NEW serious/critical accessibility violations (not in KNOWN_A11Y_DEBT):\n  ${summary}`,
  ).toEqual([])
}

// This file is named `.authed.spec.ts` so the suite's `authed` project picks it
// up — but that project injects a saved session into the default `page` fixture.
// Every test below therefore builds its own context and states which identity it
// needs, rather than inheriting one. The sign-in page in particular cannot be
// screenshotted while signed in: it redirects.
test.describe("appearance", () => {
  test("the sign-in page", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL })
    const page = await tourFreePage(context)
    try {
      await page.goto("/login")
      await page.waitForLoadState("networkidle")
      await stabilise(page)

      await expect(page).toHaveScreenshot("login.png", { fullPage: true, maxDiffPixelRatio: 0.02 })
      await expectNoSeriousA11yViolations(page, "login")
    } finally {
      await context.close()
    }
  })

  test("the 404 page is themed and offers a way back", async ({ browser }) => {
    // Regression guard: with no not-found.tsx, Next served its own light-themed
    // page outside the root layout, in an app that is dark by default.
    //
    // Signed in on purpose — an anonymous request to an unknown path is sent to
    // /login by the proxy and never reaches the 404 at all.
    const context = await contextFor(browser, "member-a")
    const page = await tourFreePage(context)
    try {
      const res = await page.goto("/cases/definitely-not-a-real-case-id/nope")
      expect(res?.status()).toBe(404)
      await stabilise(page)

      // Rendered inside the app shell, not Next's built-in fallback.
      await expect(page.getByRole("link", { name: /dashboard|началото/i })).toBeVisible()
      await expect(page).toHaveScreenshot("not-found.png", { fullPage: true, maxDiffPixelRatio: 0.02 })
      await expectNoSeriousA11yViolations(page, "not-found")
    } finally {
      await context.close()
    }
  })

  test("the dashboard", async ({ browser }) => {
    const context = await contextFor(browser, "member-a")
    const page = await tourFreePage(context)
    try {
      await page.goto("/dashboard")
      await page.waitForLoadState("networkidle")
      await stabilise(page)

      await expect(page).toHaveScreenshot("dashboard.png", {
        fullPage: false,
        maxDiffPixelRatio: 0.02,
        // This guards the chrome — theme, layout, typography — not the data.
        //
        // Every region below reflects how many cases happen to exist when the
        // test runs, which depends on what the rest of the suite has created
        // and on whether the database started clean. That is why the win32
        // baseline showed two cases while CI, starting empty, showed none.
        //
        // This previously masked `main section` last, and claimed in a comment
        // to cover the case list and its counts. It covered neither: the case
        // list is a Card, not a section, so the locator matched nothing useful
        // and every counter stayed visible. Masking by the tour and test hooks
        // instead, which are stable and exist for this kind of anchoring.
        mask: [
          page.getByTestId("ongoing-cases-count"),
          page.locator("[data-tour='dashboard-stats']"),
          page.getByTestId("dashboard-scopes"),
          page.locator("[data-tour='case-list']"),
        ],
      })
      await expectNoSeriousA11yViolations(page, "dashboard")
    } finally {
      await context.close()
    }
  })

  test("the preoperative form", async ({ browser }) => {
    const context = await contextFor(browser, "member-a")
    const page = await tourFreePage(context)
    try {
      await page.goto("/cases/new")
      await page.waitForLoadState("networkidle")
      await stabilise(page)

      await expect(page).toHaveScreenshot("preop-form.png", { fullPage: false, maxDiffPixelRatio: 0.02 })
      await expectNoSeriousA11yViolations(page, "preop form")
    } finally {
      await context.close()
    }
  })

  test("the anaesthesia record, with BMI rendered to one decimal", async ({ browser }) => {
    const context = await contextFor(browser, "member-a")
    const page = await tourFreePage(context)
    const api = context.request

    const created = await api.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()

    try {
      await page.goto(`/cases/${id}`)
      await page.waitForLoadState("networkidle")
      await stabilise(page)

      // 80 kg at 175 cm is 26.122448979591837. The record must show 26.1.
      // This is the assertion the printed chart needed and did not have.
      const bmi = page.getByText(/BMI\s+\d+(\.\d+)?/).first()
      await expect(bmi).toBeVisible()
      await expect(bmi).toHaveText(/BMI\s+26\.1(\s|$)/)

      await expectNoSeriousA11yViolations(page, "case record")
    } finally {
      await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
      await context.close()
    }
  })
})
