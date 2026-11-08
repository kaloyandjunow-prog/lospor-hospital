import { expect, type APIRequestContext, type Page } from "@playwright/test"
import { ACCOUNTS, API_BASE, signInAs, tokenFor } from "./session"

// Shared by the intraop specs: a case created through the API and started on the
// screen, the row it starts in, and what the server holds for it.

export type CaseSession = { caseId: string; authed: Record<string, string>; rowTime: string }

/** The five-minute row the case starts in, as the timetable prints it. */
export function startRowTime(now = new Date()): string {
  const rounded = new Date(now)
  rounded.setSeconds(0, 0)
  rounded.setMinutes(Math.floor(rounded.getMinutes() / 5) * 5)
  return rounded.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

export async function newStartedCase(page: Page, request: APIRequestContext): Promise<CaseSession> {
  const token = await tokenFor(request, ACCOUNTS.admin)
  const authed = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const created = await request.post(`${API_BASE}/v1/cases`, {
    headers: authed,
    data: {
      preop: {
        procedureName: "Timetable e2e", diagnosis: "Timetable e2e", asaClass: 2,
        age: 54, weight: 78, height: 172, sex: "FEMALE", urgency: "ELECTIVE",
      },
    },
  })
  expect(created.ok(), `case creation failed: ${created.status()}`).toBe(true)
  const caseId: string = (await created.json()).id

  await signInAs(page, request, ACCOUNTS.admin)
  await page.goto(`/cases/intraop/${caseId}`)
  await expect(page.getByText("Equipment", { exact: true })).toBeVisible({ timeout: 30_000 })
  const rowTime = startRowTime()
  await page.getByText("Start now", { exact: false }).first().click()
  // The header offers Start only until the case has one.
  await expect(page.getByText("Start now", { exact: false })).toHaveCount(0, { timeout: 15_000 })
  // Charting before the start has reached the server races it: the first write is refused as a
  // conflict and retried. That is the app's own recovery, but a test of one thing should not depend on it.
  const session: CaseSession = { caseId, authed, rowTime }
  await expectSaved(request, session, /Anaesthesia start/, "the start event never reached the server")
  await page.getByText("Timetable", { exact: true }).click()
  return session
}

/** Opens the start row, which is where "Add now" puts an entry. */
export async function openStartRow(page: Page, rowTime: string) {
  await page.getByText(rowTime, { exact: true }).last().click()
  await expect(page.getByText("ADD NOW")).toBeVisible()
}

/** The intraop part of the case as the API holds it, flattened to text for matching. */
export async function savedChart(request: APIRequestContext, session: CaseSession): Promise<string> {
  const response = await request.get(`${API_BASE}/v1/cases/${session.caseId}`, { headers: session.authed })
  expect(response.ok()).toBe(true)
  return JSON.stringify((await response.json()).intraop ?? {})
}

export async function expectSaved(request: APIRequestContext, session: CaseSession, pattern: RegExp, why: string) {
  await expect
    .poll(async () => pattern.test(await savedChart(request, session)), { timeout: 20_000, message: why })
    .toBe(true)
}
