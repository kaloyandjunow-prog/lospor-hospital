import { test, expect } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"

// Documenting with no connection.
//
// Theatres lose Wi-Fi. The register's answer is that a save made without a
// connection is kept locally and replayed when the connection returns — the
// clinician sees "saves waiting" rather than a lost assessment, and nothing
// they typed is dropped or written twice.
//
// Two browser contexts, deliberately: the one driving the page goes offline,
// and its request context goes offline with it, so a second signed-in context
// stays online to ask the server what it actually holds. Otherwise "the server
// has not received it" and "I cannot reach the server" look identical.

const PREOP = { ageYears: 58, sex: "MALE" as const, heightCm: 174, weightKg: 79 }

test("a save made offline is queued, then replayed once when the connection returns", async ({ browser }) => {
  const [driving, watching] = await Promise.all([
    contextFor(browser, "member-a"),
    contextFor(browser, "member-a"),
  ])
  const page = await driving.newPage()
  const server = watching.request

  const created = await server.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()

  const casesFor = async () =>
    (await server.get("/api/cases?take=200").then(r => r.json())).total as number
  const casesBefore = await casesFor()

  try {
    await page.goto(`/cases/new?continue=${id}&step=0`)
    const scores = page.locator('[data-tour="preop-scores"]')
    await expect(scores).toBeVisible({ timeout: 20_000 })

    // Let the form settle and any save triggered by loading the draft finish,
    // so what follows is unambiguously the offline one.
    await page.waitForTimeout(3_000)
    expect((await server.get(`/api/cases/${id}`).then(r => r.json())).preop.asaScore).toBeNull()

    // ── the connection drops mid-assessment ──────────────────────────────
    await driving.setOffline(true)

    await scores.getByRole("button").filter({ hasText: /^III/ }).first().click()

    // The clinician is told, rather than being left to assume it saved.
    const queued = page.getByText(/saves? waiting/i)
    await expect(queued).toBeVisible({ timeout: 20_000 })

    // And the server genuinely does not have it yet — this is what makes the
    // replay below meaningful rather than a coincidence of timing.
    expect((await server.get(`/api/cases/${id}`).then(r => r.json())).preop.asaScore).toBeNull()

    // ── the connection returns ───────────────────────────────────────────
    await driving.setOffline(false)

    await expect.poll(
      async () => (await server.get(`/api/cases/${id}`).then(r => r.json())).preop.asaScore,
      { timeout: 60_000, message: "the queued save was never replayed" },
    ).toBe("III")

    // The tray drains, so the badge goes.
    await expect(queued).toHaveCount(0, { timeout: 30_000 })

    // Replayed once, not turned into a second case. A replay that re-POSTs
    // instead of re-PATCHing would leave the clinician with two records of the
    // same operation and no way to tell which is the real one.
    expect(await casesFor()).toBe(casesBefore)
  } finally {
    await driving.setOffline(false)
    await server.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    await driving.close()
    await watching.close()
  }
})

test("work already loaded stays readable with no connection", async ({ browser }) => {
  const online = await contextFor(browser, "member-a")
  const created = await online.request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: { preop: { ...PREOP, asaScore: "II" } },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()

  const page = await online.newPage()
  try {
    await page.goto(`/cases/new?continue=${id}&step=0`)
    await expect(page.locator('[data-tour="preop-scores"]')).toBeVisible({ timeout: 20_000 })

    // Losing the network must not blank the screen the clinician is working
    // from. The assessment they already have stays in front of them.
    await online.setOffline(true)
    await expect(page.locator('[data-tour="preop-demographics"]')).toBeVisible()
    await expect(page.locator('[data-tour="preop-scores"]')).toBeVisible()
  } finally {
    await online.setOffline(false)
    await online.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    await online.close()
  }
})
