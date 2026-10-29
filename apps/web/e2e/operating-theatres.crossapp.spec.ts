import { test, expect, type Page } from "@playwright/test"
import { contextFor, EMAIL_FOR, JSON_HEADERS } from "./roles"
import { openPhone } from "./pwa"
import { withTheatres } from "./theatres-setup"

/**
 * Operating theatres across both apps (10.0.0). Status is not part of this
 * harness, so the spec switches theatres on and adds two of its own
 * (theatres-setup.ts), and puts both back afterwards.
 *
 * - Web: a theatre is assigned from the dashboard, shows in the case header and
 *   on the print, and filters the list; the anaesthesiologist filter too.
 * - Phone: held on a case, "Assign operating theatre" picks one; the card shows
 *   it and the theatre filter narrows the list.
 * - Once intraop has started, the theatre is fixed: the API refuses a change
 *   and neither app offers one.
 */
let setup: Awaited<ReturnType<typeof withTheatres>>
test.beforeAll(async () => { setup = await withTheatres() })
test.afterAll(async () => { await setup?.restore() })
test.describe.configure({ timeout: 240_000 })

type Theatre = { id: string; name: string }

async function caseRow(page: Page, caseCode: string) {
  return page.locator("a").filter({ hasText: caseCode }).first()
}

test("theatres are assigned, shown, filtered and fixed at the start of intraop", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  await context.addInitScript(() => { localStorage.setItem("tourCompleted", "1") })
  const page = await context.newPage()
  const config = await (await context.request.get("/api/operating-theatres")).json() as { enabled: boolean; theatres: Theatre[] }
  expect(config.enabled).toBe(true)
  expect(config.theatres.length).toBeGreaterThanOrEqual(2)
  const [first, second] = config.theatres
  // The two this spec added lead the list.
  expect([first, second]).toEqual(setup.theatres)

  const create = async (procedure: string) => {
    const created = await context.request.post("/api/cases", {
      headers: JSON_HEADERS,
      data: { patientNumber: `THEATRES-E2E-${Date.now()}`, preop: { ageYears: 50, sex: "MALE", heightCm: 175, weightKg: 80, clinicalMode: "ADULT", plannedProcedure: procedure } },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json() as { id: string }
    const record = await (await context.request.get(`/api/cases/${id}`)).json() as { caseCode: string; theatre: { id: string | null; changeable: boolean } | null }
    expect(record.theatre).toEqual({ id: null, name: null, changeable: true })
    return { id, code: record.caseCode }
  }
  const caseA = await create("Theatre e2e A")
  const caseB = await create("Theatre e2e B")

  try {
    // ── Web: assign from the dashboard ──
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
    const rowA = await caseRow(page, caseA.code)
    await rowA.getByTestId("theatre-button").click()
    await page.getByTestId("theatre-menu").getByRole("button", { name: first.name }).click()
    await expect(rowA.getByTestId("theatre-button")).toContainText(first.name)

    // The theatre filter keeps A and drops B; "no theatre" the other way round.
    await page.getByTestId("filter-theatre").selectOption(first.id)
    await expect(page.locator("a").filter({ hasText: caseA.code })).toHaveCount(1)
    await expect(page.locator("a").filter({ hasText: caseB.code })).toHaveCount(0)
    await page.getByTestId("filter-theatre").selectOption("none")
    await expect(page.locator("a").filter({ hasText: caseB.code })).toHaveCount(1)
    await expect(page.locator("a").filter({ hasText: caseA.code })).toHaveCount(0)
    // The anaesthesiologist filter: both are this clinician's.
    await page.getByRole("button", { name: /Clear filters/ }).click()
    await expect(page.getByTestId("filter-theatre")).toHaveValue("")
    const me = await (await context.request.get("/api/user")).json() as { id: string }
    await page.getByTestId("filter-assignee").selectOption(me.id)
    await expect(page.locator("a").filter({ hasText: caseA.code })).toHaveCount(1)
    await expect(page.locator("a").filter({ hasText: caseB.code })).toHaveCount(1)

    // The case header shows it.
    await page.goto(`/cases/new?continue=${caseA.id}&step=0`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("case-theatre")).toContainText(first.name, { timeout: 30_000 })

    // A web dashboard left open: it will be out of date once the phone acts.
    const stale = await context.newPage()
    await stale.goto("/dashboard", { waitUntil: "domcontentloaded" })
    await expect((await caseRow(stale, caseB.code)).getByTestId("theatre-button")).toBeVisible()

    // ── Phone: hold a case, assign its theatre ──
    const phone = await openPhone(browser, EMAIL_FOR["member-a"])
    try {
      await phone.page.goto("/", { waitUntil: "domcontentloaded" })
      const card = phone.page.getByText(caseB.code, { exact: true }).first()
      await expect(card).toBeVisible({ timeout: 60_000 })
      const box = (await card.boundingBox())!
      await phone.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await phone.page.mouse.down()
      await phone.page.waitForTimeout(900)
      await phone.page.mouse.up()
      await phone.page.getByText("Assign operating theatre…").click()
      await phone.page.getByTestId("theatre-sheet").getByText(second.name, { exact: true }).click()
      await expect(phone.page.getByText(second.name, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
      const saved = await (await context.request.get(`/api/cases/${caseB.id}`)).json() as { theatre: { id: string } }
      expect(saved.theatre.id).toBe(second.id)

      // The phone's theatre filter.
      await phone.page.getByText(/^Theatre: /).click()
      await phone.page.getByTestId("filter-sheet").getByText(second.name, { exact: true }).click()
      await expect(phone.page.getByText(caseB.code, { exact: true })).toBeVisible({ timeout: 30_000 })
      await expect(phone.page.getByText(caseA.code, { exact: true })).toHaveCount(0)
    } finally {
      await phone.context.close()
    }

    // ── Two people at once: the out-of-date web view is refused, not obeyed ──
    const staleRow = await caseRow(stale, caseB.code)
    await staleRow.getByTestId("theatre-button").click()
    await stale.getByTestId("theatre-menu").getByRole("button", { name: first.name }).click()
    await expect(stale.getByTestId("theatre-menu")).toContainText(`Changed meanwhile to ${second.name} by`)
    await expect(staleRow.getByTestId("theatre-button")).toContainText(second.name)
    expect((await (await context.request.get(`/api/cases/${caseB.id}`)).json()).theatre.id).toBe(second.id)
    // Chosen again on the corrected view, it goes through.
    await stale.getByTestId("theatre-menu").getByRole("button", { name: first.name }).click()
    await expect(staleRow.getByTestId("theatre-button")).toContainText(first.name)
    await stale.close()

    // ── Intraop starts: the theatre is fixed ──
    const started = await context.request.patch(`/api/cases/${caseA.id}`, {
      headers: JSON_HEADERS,
      data: { intraop: { startedAt: new Date(Date.now() - 10 * 60_000).toISOString(), timezone: "Europe/Sofia", techniques: ["GENERAL_BALANCED"] } },
    })
    expect(started.ok(), await started.text()).toBeTruthy()
    const refused = await context.request.post(`/api/cases/${caseA.id}/theatre`, { headers: JSON_HEADERS, data: { theatreId: second.id } })
    expect(refused.status()).toBe(409)
    expect((await refused.json()).error).toBe("THEATRE_LOCKED_INTRAOP_STARTED")
    const locked = await (await context.request.get(`/api/cases/${caseA.id}`)).json() as { theatre: { name: string; changeable: boolean } }
    expect(locked.theatre).toMatchObject({ name: first.name, changeable: false })

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
    const lockedRow = await caseRow(page, caseA.code)
    await expect(lockedRow).toContainText(first.name)
    await expect(lockedRow.getByTestId("theatre-button")).toHaveCount(0)

    // The print carries it.
    await page.goto(`/cases/${caseA.id}/print`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("print-theatre").first()).toContainText(first.name, { timeout: 30_000 })
  } finally {
    // THEATRES_E2E_KEEP leaves the cases, to look at what was stored.
    if (!process.env.THEATRES_E2E_KEEP) for (const item of [caseA, caseB]) await context.request.delete(`/api/cases/${item.id}`, { headers: JSON_HEADERS })
    await context.close()
  }
})
