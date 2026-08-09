import { test, expect } from "@playwright/test"
import { contextFor } from "./roles"

// Who gets the admin page, and how much of it.
//
// A head of department is not an administrator, but they do decide who joins
// their department — so they get this page with exactly one section on it. The
// page used to bounce anyone whose user list came back 403, which locked heads
// of department out of the only queue that was theirs to act on.

/**
 * Waits until the page has actually answered the question.
 *
 * This page renders its section headings immediately and fills them in when the
 * fetches return, and `isAdmin` starts false — so every administrator-only
 * section is absent while it loads, whoever is looking. Asserting absence
 * before then passes whether or not the rule holds. The queue's `(N)` count is
 * rendered only once loading is done, so it is a safe thing to wait on.
 */
async function waitForLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByText(/Requests to join a department\s*\(\d+\)/))
    .toBeVisible({ timeout: 20_000 })
}

test("a head of department reaches the admin page and sees only the department queue", async ({ browser }) => {
  const context = await contextFor(browser, "hod-a")
  const page = await context.newPage()
  try {
    await page.goto("/admin")
    await waitForLoaded(page)
    // Not sent away.
    await expect(page).toHaveURL(/\/admin/)
    // Administrator-only sections stay hidden: approving registrations, granting
    // roles and the full user list are not a head of department's business.
    await expect(page.getByText("Pending registrations", { exact: false })).toHaveCount(0)
    await expect(page.getByText("Head of Department requests", { exact: false })).toHaveCount(0)
    await expect(page.getByText("All users", { exact: false })).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test("an administrator sees the whole page", async ({ browser }) => {
  const context = await contextFor(browser, "admin")
  const page = await context.newPage()
  try {
    await page.goto("/admin")
    await waitForLoaded(page)
    await expect(page.getByText("Pending registrations", { exact: false }).first()).toBeVisible()
    await expect(page.getByText("All users", { exact: false }).first()).toBeVisible()
  } finally {
    await context.close()
  }
})

test("a member is sent back to the dashboard", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  try {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
  } finally {
    await context.close()
  }
})
