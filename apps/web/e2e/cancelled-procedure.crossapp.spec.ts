import { test, expect, type APIRequestContext } from "@playwright/test"
import { contextFor, EMAIL_FOR, JSON_HEADERS } from "./roles"
import { openPhone } from "./pwa"

/**
 * A cancelled procedure, a planned procedure not yet known, and the procedure
 * done (10.0.0), across both apps.
 *
 * - Web: "Procedure cancelled" beside Delete, with a reason; the case shows it,
 *   opens read-only, refuses edits, and the cancellation can be undone.
 * - A case whose anaesthesia has started cannot be cancelled.
 * - Phone: held, a case is cancelled with "Other" and a note.
 * - "Not yet known" stands for the planned procedure; the procedure done is
 *   then filled in in postop, starts as the plan otherwise, and is required to
 *   finalise when the plan was not known.
 */
test.describe.configure({ timeout: 240_000 })

const preop = (extra: Record<string, unknown> = {}) => ({
  ageYears: 50, sex: "MALE", heightCm: 175, weightKg: 80, clinicalMode: "ADULT", asaScore: "II",
  diagnoses: [{ label: "Cholelithiasis", code: "K80.2", sub: "K80.2", system: "ICD-10" }], ...extra,
})

async function create(request: APIRequestContext, data: Record<string, unknown>) {
  const created = await request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: { patientNumber: `CANCELLED-PROCEDURE-E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...data },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json() as { id: string }
  const record = await (await request.get(`/api/cases/${id}`)).json() as { caseCode: string }
  return { id, code: record.caseCode }
}

test("a procedure is cancelled before anaesthesia, shown, closed and undone", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  await context.addInitScript(() => { localStorage.setItem("tourCompleted", "1") })
  const page = await context.newPage()
  const ids: string[] = []
  try {
    const web = await create(context.request, { preop: preop({ procedures: [{ label: "Cholecystectomy" }] }) })
    const phoneCase = await create(context.request, { preop: preop({ procedures: [{ label: "Hernia repair" }] }) })
    const started = await create(context.request, {
      preop: preop({ procedures: [{ label: "Appendectomy" }] }),
      intraop: { startedAt: new Date(Date.now() - 20 * 60_000).toISOString(), timezone: "Europe/Sofia", techniques: ["GENERAL_BALANCED"] },
    })
    ids.push(web.id, phoneCase.id, started.id)

    // ── Web: cancel from the dashboard ──
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
    const row = page.locator("a").filter({ hasText: web.code }).first()
    await row.getByTestId("cancel-procedure").click()
    const dialog = page.getByTestId("cancel-dialog")
    await dialog.getByLabel("No theatre time or staff").check()
    await dialog.getByTestId("cancel-confirm").click()
    await expect(page.locator("a").filter({ hasText: web.code }).first().getByTestId("cancelled-badge")).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("a").filter({ hasText: web.code }).first().getByRole("button", { name: /Hand over|Assign/ })).toHaveCount(0)
    const cancelled = await (await context.request.get(`/api/cases/${web.id}`)).json() as { status: string; cancellationReason: string }
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancellationReason: "NO_THEATRE_TIME_OR_STAFF" })

    // Closed: an edit is refused, the form opens the read-only record with the label.
    const edit = await context.request.patch(`/api/cases/${web.id}`, { headers: JSON_HEADERS, data: { preop: { weightKg: 81 } } })
    expect(edit.status()).toBe(409)
    expect((await edit.json()).code).toBe("CASE_CANCELLED")
    await page.goto(`/cases/new?continue=${web.id}`, { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(new RegExp(`/cases/${web.id}$`), { timeout: 30_000 })
    await expect(page.getByTestId("case-cancelled")).toContainText("Procedure cancelled · No theatre time or staff")
    await expect(page.getByTestId("summary-cancelled")).toBeVisible()
    // Read only, like a finished case: no edits, no closing, no handover; printing stays.
    await expect(page.getByRole("button", { name: /Close Now/ })).toHaveCount(0)
    await expect(page.locator(`a[href*="continue=${web.id}"]`)).toHaveCount(0)
    await expect(page.locator(`a[href="/cases/${web.id}/print"]`).first()).toBeVisible()

    // Undone: back to where it was.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
    const cancelledRow = page.locator("a").filter({ hasText: web.code }).first()
    await cancelledRow.getByTestId("undo-cancellation").click()
    await cancelledRow.getByTestId("undo-cancellation").click()
    await expect.poll(async () => (await (await context.request.get(`/api/cases/${web.id}`)).json()).status, { timeout: 30_000 }).toBe("DRAFT")

    // ── Too late once anaesthesia has started ──
    const late = await context.request.post(`/api/cases/${started.id}/cancel`, { headers: JSON_HEADERS, data: { reason: "PATIENT_CONDITION" } })
    expect(late.status()).toBe(409)
    expect((await late.json()).code).toBe("CANCELLATION_TOO_LATE")
    // The button stays, visibly inactive, and a click on it does nothing.
    const startedRow = page.locator("a").filter({ hasText: started.code }).first()
    const inactive = startedRow.getByTestId("cancel-procedure")
    await expect(inactive).toHaveAttribute("aria-disabled", "true")
    await expect(inactive).toHaveAttribute("title", /Anaesthesia has started/)
    await inactive.click({ force: true })
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByTestId("cancel-dialog")).toHaveCount(0)

    // ── Phone: held, cancelled with "Other" and a note ──
    const phone = await openPhone(browser, EMAIL_FOR["member-a"])
    const hold = async (code: string) => {
      const target = phone.page.getByText(code, { exact: true }).first()
      await expect(target).toBeVisible({ timeout: 60_000 })
      const at = (await target.boundingBox())!
      await phone.page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
      await phone.page.mouse.down()
      await phone.page.waitForTimeout(900)
      await phone.page.mouse.up()
    }
    try {
      await phone.page.goto("/", { waitUntil: "domcontentloaded" })
      // Started: the item is there, inactive, saying why.
      await hold(started.code)
      await expect(phone.page.getByTestId("cancel-procedure-inactive")).toContainText("Anaesthesia has started", { timeout: 20_000 })
      await phone.page.getByTestId("cancel-procedure-inactive").click({ force: true })
      await expect(phone.page.getByTestId("cancel-sheet")).toHaveCount(0)
      await phone.page.keyboard.press("Escape")
      await phone.page.goto("/", { waitUntil: "domcontentloaded" })
      const card = phone.page.getByText(phoneCase.code, { exact: true }).first()
      await expect(card).toBeVisible({ timeout: 60_000 })
      const box = (await card.boundingBox())!
      await phone.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await phone.page.mouse.down()
      await phone.page.waitForTimeout(900)
      await phone.page.mouse.up()
      await phone.page.getByText("Procedure cancelled…").click()
      await phone.page.getByTestId("cancel-sheet").getByText("Other", { exact: true }).click()
      await phone.page.getByPlaceholder("Say what the reason was").fill("Surgeon unwell")
      await phone.page.getByTestId("cancel-confirm").click()
      await expect.poll(async () => (await (await context.request.get(`/api/cases/${phoneCase.id}`)).json()).status, { timeout: 30_000 }).toBe("CANCELLED")
      const saved = await (await context.request.get(`/api/cases/${phoneCase.id}`)).json() as { cancellationReason: string; cancellationNote: string }
      expect(saved).toMatchObject({ cancellationReason: "OTHER", cancellationNote: "Surgeon unwell" })
      // Its detail screen is read only: the label, no edits, no finalise.
      await phone.page.goto(`/cases/${phoneCase.id}`, { waitUntil: "domcontentloaded" })
      await expect(phone.page.getByTestId("case-cancelled")).toBeVisible({ timeout: 60_000 })
      await expect(phone.page.getByText("Edit:", { exact: true })).toHaveCount(0)
      await expect(phone.page.getByText("Finalise case")).toHaveCount(0)
    } finally {
      await phone.context.close()
    }
  } finally {
    for (const id of ids) {
      await context.request.delete(`/api/cases/${id}/cancel`, { headers: JSON_HEADERS })
      await context.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    }
    await context.close()
  }
})

test("a planned procedure not yet known, and the procedure done", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  await context.addInitScript(() => { localStorage.setItem("tourCompleted", "1") })
  const page = await context.newPage()
  const ids: string[] = []
  try {
    const unknown = await create(context.request, { preop: preop({ procedureUndetermined: true, procedures: [{ label: "Ignored when not yet known" }] }) })
    const known = await create(context.request, { preop: preop({ procedures: [{ label: "Cholecystectomy" }] }) })
    ids.push(unknown.id, known.id)

    // "Not yet known" stands for the procedure; any procedure sent with it is set aside.
    const record = await (await context.request.get(`/api/cases/${unknown.id}`)).json() as { preop: { procedureUndetermined: boolean; proceduresJson: unknown; plannedProcedure: string } }
    expect(record.preop).toMatchObject({ procedureUndetermined: true, proceduresJson: null, plannedProcedure: "" })
    await page.goto(`/cases/new?continue=${unknown.id}&step=0`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("procedure-undetermined")).toBeChecked({ timeout: 60_000 })
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
    await expect(page.locator("a").filter({ hasText: unknown.code }).first()).toContainText("Procedure not yet known")
    // The case page names it too, rather than an empty heading.
    await page.goto(`/cases/${unknown.id}`, { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Procedure not yet known", { timeout: 60_000 })
    // So does the phone: the case screen, and the intraop screen's header.
    const phone = await openPhone(browser, EMAIL_FOR["member-a"])
    try {
      await phone.page.goto(`/cases/${unknown.id}`, { waitUntil: "domcontentloaded" })
      await expect(phone.page.getByText("Procedure not yet known — decided during surgery").first()).toBeVisible({ timeout: 60_000 })
      await phone.page.goto(`/cases/intraop/${unknown.id}`, { waitUntil: "domcontentloaded" })
      await expect(phone.page.getByText("Procedure not yet known — decided during surgery").first()).toBeVisible({ timeout: 60_000 })
    } finally {
      await phone.context.close()
    }

    // Postop: the procedure done starts as the plan; required when the plan was not known.
    await page.goto(`/cases/new?continue=${known.id}&step=2`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("performed-procedure")).toContainText("Cholecystectomy", { timeout: 60_000 })
    await page.goto(`/cases/new?continue=${unknown.id}&step=2`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("performed-procedure")).toContainText("record what was done", { timeout: 60_000 })

    const postop = { aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2, aldreteSpO2: 2, disposition: "WARD" }
    const withoutDone = await context.request.patch(`/api/cases/${unknown.id}`, { headers: JSON_HEADERS, data: { postop } })
    expect(withoutDone.ok(), await withoutDone.text()).toBeTruthy()
    const refused = await context.request.post(`/api/cases/${unknown.id}/finalize`, { headers: JSON_HEADERS, data: {} })
    expect(refused.ok()).toBeFalsy()
    expect(await refused.text()).toContain("missing_performed_procedure")

    const done = await context.request.patch(`/api/cases/${unknown.id}`, { headers: JSON_HEADERS, data: { postop: { performedProcedures: [{ label: "Exploratory laparotomy" }] } } })
    expect(done.ok(), await done.text()).toBeTruthy()
    const after = await (await context.request.get(`/api/cases/${unknown.id}`)).json() as { postop: { performedProceduresJson: { label: string }[] } }
    expect(after.postop.performedProceduresJson).toEqual([expect.objectContaining({ label: "Exploratory laparotomy" })])
    const stillRefused = await context.request.post(`/api/cases/${unknown.id}/finalize`, { headers: JSON_HEADERS, data: {} })
    expect(await stillRefused.text()).not.toContain("missing_performed_procedure")
  } finally {
    for (const id of ids) await context.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await context.close()
  }
})
