import { expect, test } from "@playwright/test"
import { ACCOUNTS, API_BASE, expectDialogs, signInAs, tokenFor } from "./session"

// A phone watching a case another device holds (1.4.14 appliance test). It
// only blocked End case and the attention answers, so it still planned a rate
// change -- saved over the device that held the case. Watching is read-only
// now, as on the web: the change is refused, said why, and nothing is saved.

const FIVE_MINUTES = 5 * 60_000

test("a phone watching a case another device holds writes nothing", async ({ page, request }) => {
  const token = await tokenFor(request, ACCOUNTS.admin)
  const authed = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  // On a five-minute boundary twenty minutes ago, so the row after now is
  // simple arithmetic.
  const startedAt = new Date(Math.floor((Date.now() - 20 * 60_000) / FIVE_MINUTES) * FIVE_MINUTES)
  const created = await request.post(`${API_BASE}/v1/cases`, {
    headers: authed,
    data: {
      preop: { age: 41, weight: 82, height: 178, sex: "MALE", urgency: "ELECTIVE" },
      intraop: { startedAt: startedAt.toISOString(), timezone: "UTC" },
    },
  })
  expect(created.ok(), `case creation failed: ${created.status()} ${await created.text()}`).toBe(true)
  const caseId: string = (await created.json()).id
  const infusion = await request.post(`${API_BASE}/v1/cases/${caseId}/events`, {
    headers: authed,
    data: {
      id: `e2e-prop-${caseId}`, type: "infusion_start", infId: `e2e-prop-${caseId}`, name: "Propofol",
      rate: "6", unit: "mg/kg/hr", color: "#8b5cf6", ts: new Date(startedAt.getTime() + FIVE_MINUTES).toISOString(),
    },
  })
  expect(infusion.ok(), `infusion failed: ${infusion.status()} ${await infusion.text()}`).toBe(true)

  // Another device holds the case.
  const held = await request.post(`${API_BASE}/v1/cases/${caseId}/lock`, { headers: authed, data: { deviceId: "e2e-other-device" } })
  expect(held.ok(), `lock failed: ${held.status()} ${await held.text()}`).toBe(true)

  const dialogs = expectDialogs(page, [/watching mode[\s\S]*Take over to change this case/])
  await signInAs(page, request, ACCOUNTS.admin)
  await page.goto(`/cases/intraop/${caseId}`)
  await expect(page.getByText(/watching mode/).first()).toBeVisible({ timeout: 30_000 })
  await page.getByText("Timetable", { exact: true }).click()

  const later = Math.floor((Date.now() - startedAt.getTime()) / FIVE_MINUTES) + 3
  const row = page.getByTestId(`timetable-row-${later}`)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await page.getByText(/^Propofol/).first().click()
  const refused = page.waitForEvent("dialog")
  await page.getByText(/^Change to /).last().click()
  expect((await refused).message()).toMatch(/Take over to change this case/)

  await expect.poll(async () => {
    const record = await request.get(`${API_BASE}/v1/cases/${caseId}`, { headers: authed })
    const log = ((await record.json()).intraop?.keyEvents?.log ?? []) as { type: string }[]
    return log.filter(event => event.type === "infusion_rate").length
  }, { timeout: 5_000 }).toBe(0)
  dialogs.assertNoSurprises()

  await request.delete(`${API_BASE}/v1/cases/${caseId}/lock`, { headers: authed, data: { force: true } })
  await request.delete(`${API_BASE}/v1/cases/${caseId}`, { headers: authed })
})
