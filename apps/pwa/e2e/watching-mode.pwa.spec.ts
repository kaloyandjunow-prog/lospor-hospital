import { expect, test } from "@playwright/test"
import { ACCOUNTS, API_BASE, signInAs, tokenFor } from "./session"

// 10.8.0: several people may chart one case at once (the anaesthetist and the nurses); the last edit wins.
// A phone on a case another device holds is therefore not made a read-only watcher any more (it was, until
// 10.7: "watching mode ... Take over to change this case"): it charts, and nothing asks it to take over.

test("a phone on a case another device holds is not turned away", async ({ page, request }) => {
  const token = await tokenFor(request, ACCOUNTS.admin)
  const authed = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const created = await request.post(`${API_BASE}/v1/cases`, {
    headers: authed,
    data: {
      patientNumber: `WATCHING-MODE-E2E-${Date.now()}`,
      preop: { age: 41, weight: 82, height: 178, sex: "MALE", urgency: "ELECTIVE" },
      intraop: { startedAt: new Date(Date.now() - 20 * 60_000).toISOString(), timezone: "UTC" },
    },
  })
  expect(created.ok(), `case creation failed: ${created.status()} ${await created.text()}`).toBe(true)
  const caseId: string = (await created.json()).id

  // Another device holds the case: the answer is shared, not refused.
  const held = await request.post(`${API_BASE}/v1/cases/${caseId}/lock`, { headers: authed, data: { deviceId: "e2e-other-device" } })
  expect(held.ok(), `lock failed: ${held.status()} ${await held.text()}`).toBe(true)

  await signInAs(page, request, ACCOUNTS.admin)
  await page.goto(`/cases/intraop/${caseId}`)
  await expect(page.getByText("Timetable", { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2_000)
  await expect(page.getByText(/watching mode/)).toHaveCount(0)
  await expect(page.getByText(/Take over to change this case/)).toHaveCount(0)

  await request.delete(`${API_BASE}/v1/cases/${caseId}/lock`, { headers: authed, data: { force: true } })
  await request.delete(`${API_BASE}/v1/cases/${caseId}`, { headers: authed })
})
