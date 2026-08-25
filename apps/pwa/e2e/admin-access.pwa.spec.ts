import { expect, test } from "@playwright/test"
import { ACCOUNTS, expectDialogs, signInAs } from "./session"

// The administration screen, and how much of it each person gets.
//
// A head of department is not an administrator, but they do decide who joins
// their department. The screen used to load its four lists together, so the 403
// a head gets on the administrator lists failed the whole load and locked them
// out of the one queue that was theirs to act on.
//
// Absence is only meaningful once the screen has finished loading, and this one
// makes that easy: it holds a full-screen loading state until every list has
// come back, so the heading below cannot appear before the answer is known.

test("a head of department gets the department queue and nothing else", async ({ page, request }) => {
  const dialogs = expectDialogs(page, [])
  await signInAs(page, request, ACCOUNTS.hodA)
  await page.goto("/admin")

  // Not the administrator console: a head of department is given their own
  // queue, under its own heading. Matched by test id, so the assertion
  // survives the wording changing or being read in Bulgarian.
  await expect(page.getByTestId("department-queue-heading")).toBeVisible()
  await expect(page.getByTestId("admin-console-heading")).toHaveCount(0)
  // The queue they are entitled to decide, already selected for them.
  await expect(page.getByTestId("admin-tab-departments")).toBeVisible()
  // Administrator-only tabs stay away.
  await expect(page.getByTestId("admin-tab-registrations")).toHaveCount(0)
  await expect(page.getByTestId("admin-tab-hod-requests")).toHaveCount(0)
  await expect(page.getByTestId("admin-tab-users")).toHaveCount(0)
  await expect(page.getByText("Admin access is required.", { exact: true })).toHaveCount(0)
  dialogs.assertNoSurprises()
})

test("an administrator gets all of it", async ({ page, request }) => {
  const dialogs = expectDialogs(page, [])
  await signInAs(page, request, ACCOUNTS.admin)
  await page.goto("/admin")

  await expect(page.getByTestId("admin-console-heading")).toBeVisible()
  await expect(page.getByTestId("admin-tab-registrations")).toBeVisible()
  await expect(page.getByTestId("admin-tab-hod-requests")).toBeVisible()
  await expect(page.getByTestId("admin-tab-departments")).toBeVisible()
  await expect(page.getByTestId("admin-tab-users")).toBeVisible()
  dialogs.assertNoSurprises()
})

test("an ordinary clinician is told they cannot be here", async ({ page, request }) => {
  const dialogs = expectDialogs(page, [])
  await signInAs(page, request, ACCOUNTS.memberA)
  await page.goto("/admin")

  await expect(page.getByText("Admin access is required.", { exact: true }))
    .toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId("admin-tab-departments")).toHaveCount(0)
  dialogs.assertNoSurprises()
})
