import { expect, test } from "@playwright/test"
import {
  ACCOUNTS, declineNextDialog, expectDialogs, signInAs,
  INSTITUTION_B_NAME, NO_INSTITUTION_NAME,
} from "./session"

// Joining and leaving a department, from the phone.
//
// The rules are the server's and the web suite pins them there. What only this
// suite can show is that the phone's settings screen drives them correctly:
// that "Leave" actually leaves rather than filing a request nobody will answer,
// that it disappears once there is nothing left to leave, and that choosing a
// hospital files a request and says so instead of relabelling itself as though
// the move had already happened — which is what it used to do.
//
// member-b does the moving. A failed run can leave them unaffiliated; the
// seeder in lospor-api puts the cast back.

const LEAVE_CONFIRMATION = /Leave this institution\?/

test("declining the confirmation leaves you where you were", async ({ page, request }) => {
  // The branch worth being sure about. A confirmation that does the thing
  // anyway is worse than no confirmation, and it is invisible from the happy
  // path — which is the only path a test that accepts every dialog can take.
  await signInAs(page, request, ACCOUNTS.memberB)
  await page.goto("/settings")
  await expect(page.getByText(INSTITUTION_B_NAME, { exact: false })).toBeVisible()

  const declined = declineNextDialog(page)
  await page.getByText("Leave", { exact: true }).click()

  expect(declined.seen(), "no confirmation was shown before leaving").toHaveLength(1)
  expect(declined.seen()[0]).toMatch(LEAVE_CONFIRMATION)

  // Nothing moved, and the control is still there to be used properly.
  await expect(page.getByText(INSTITUTION_B_NAME, { exact: false })).toBeVisible()
  await expect(page.getByText(NO_INSTITUTION_NAME, { exact: false })).toHaveCount(0)
  await expect(page.getByText("Leave", { exact: true })).toBeVisible()
})

test("leaving applies at once; joining waits for the receiving head", async ({ page, request, browser }) => {
  // Everything this flow is expected to say, in order: confirm the departure,
  // report where they landed, and acknowledge the request to join.
  const dialogs = expectDialogs(page, [
    LEAVE_CONFIRMATION,
    /You have left/,
    /Request sent/,
  ])
  await signInAs(page, request, ACCOUNTS.memberB)

  await page.goto("/settings")
  await expect(page.getByText("Institution", { exact: true })).toBeVisible()
  await expect(page.getByText(INSTITUTION_B_NAME, { exact: false })).toBeVisible()

  // ── leaving ──────────────────────────────────────────────────────────
  const leave = page.getByText("Leave", { exact: true })
  await expect(leave).toBeVisible()
  await leave.click()

  // No pending state: the server applied it, so the screen shows where they
  // are now rather than what they asked for.
  await expect(page.getByText(NO_INSTITUTION_NAME, { exact: false })).toBeVisible({ timeout: 20_000 })
  // Nothing left to leave.
  await expect(page.getByText("Leave", { exact: true })).toHaveCount(0)

  // ── asking to go back ────────────────────────────────────────────────
  await page.getByText("Edit institution", { exact: true }).click()
  const search = page.getByPlaceholder("Search institutions…")
  await expect(search).toBeVisible()
  await search.fill("E2E Second")
  await page.getByText(INSTITUTION_B_NAME, { exact: false }).first().click()

  // Reported as a request, not as a move. The head of that department has to
  // agree before it takes effect, because approving is what lets them see this
  // clinician's cases.
  await expect(page.getByText(/Requested:/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(NO_INSTITUTION_NAME, { exact: false })).toBeVisible()

  // ── the head of that department decides ──────────────────────────────
  // A separate browser context: two sessions on one origin would share the
  // token store, and the second sign-in would simply replace the first.
  const headContext = await browser.newContext()
  const head = await headContext.newPage()
  const headDialogs = expectDialogs(head, [])
  try {
    await signInAs(head, request, ACCOUNTS.hodB)
    await head.goto("/admin")
    await expect(head.getByText("Administration", { exact: true })).toBeVisible()

    // The request is in their queue, naming who is asking and where.
    await expect(head.getByText(/Asks to join/)).toBeVisible({ timeout: 20_000 })

    // Wait on the decision request itself, not on the row disappearing. The
    // list re-renders while it reloads, so "the row is gone" is briefly true
    // before anything has been decided — and closing this context on the back
    // of that aborted the POST in flight, leaving the request pending while
    // the test believed it had been approved.
    const decided = head.waitForResponse(
      response => response.url().includes("/admin/institution-requests/")
        && response.request().method() === "POST",
      { timeout: 30_000 },
    )
    await head.getByText("Approve", { exact: true }).first().click()
    const decision = await decided
    expect(decision.status(), await decision.text()).toBe(200)
    await expect(head.getByText(/Asks to join/)).toHaveCount(0, { timeout: 20_000 })

    // Approved, so the move has happened — and this also puts member-b back
    // where the seeder left them, for the next run and for the web suite.
    // Checked before this context closes, for the reason above.
    await page.reload()
    await expect(page.getByText(INSTITUTION_B_NAME, { exact: false })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Requested:/)).toHaveCount(0)
    headDialogs.assertNoSurprises()
  } finally {
    await headContext.close()
  }

  dialogs.assertNoSurprises()
})
