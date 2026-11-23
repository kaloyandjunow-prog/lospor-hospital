import { expect, test } from "@playwright/test"
import { expectSaved, newStartedCase, openStartRow, savedChart } from "./intraop-helpers"

// The one chart menu on the phone (10.8.0): a running item in the open row opens the same menu as
// the web chart, Stop asks nothing and leaves an Undo bar, Undo takes it back, and the row says how
// long the item has run.

async function startSevoflurane(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext) {
  const session = await newStartedCase(page, request)
  await openStartRow(page, session.rowTime)
  await page.getByText("Agent", { exact: true }).first().click()
  await page.getByText("Sevoflurane", { exact: true }).click()
  await page.getByText("2.5", { exact: true }).click()
  await page.getByText("Start Sevoflurane", { exact: true }).click()
  await expectSaved(request, session, /agent_start/, "the agent start never reached the server")
  // A start in an earlier row asks at once whether it is still running (rule 4): answer it.
  if (await page.getByText(/still running\?/).waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) {
    await page.getByText(/still running?/).locator("xpath=following::*[normalize-space(text())='Running'][1]").click()
    await expect(page.getByText(/still running?/)).toHaveCount(0)
  }
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  return session
}

test.describe("the cell menu on the phone", () => {
  test("a running item says how long it has run", async ({ page, request }) => {
    await startSevoflurane(page, request)
    await expect(page.locator('[data-testid^="running-total-"]').first()).toContainText(/min/)
  })

  test("Stop needs no confirmation and Undo takes it back", async ({ page, request }) => {
    const session = await startSevoflurane(page, request)
    // The running card (its total is inside it); "Sevoflurane 2.5% added" in the Undo bar is not the card.
    await page.locator('[data-testid^="running-total-"]').first().click()
    await page.getByText("Stop", { exact: true }).click()

    await expect(page.getByTestId("cell-menu-undo-bar")).toBeVisible()
    await expectSaved(request, session, /agent_stop|"stopped":\s*true|endTs/, "the stop never reached the server")
    const stopped = await savedChart(request, session)

    await page.getByTestId("cell-menu-undo").click()
    await expect(page.getByTestId("cell-menu-undo-bar")).toHaveCount(0)
    // Undone: the saved chart no longer carries the stop.
    await expect.poll(async () => await savedChart(request, session), { timeout: 20_000 }).not.toBe(stopped)
  })
})
