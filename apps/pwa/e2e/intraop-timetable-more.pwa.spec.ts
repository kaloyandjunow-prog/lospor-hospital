import { expect, test } from "@playwright/test"
import { API_BASE } from "./session"
import { expectSaved, newStartedCase, openStartRow, savedChart } from "./intraop-helpers"

// What the first timetable spec does not reach: things that run (infusions, a volatile agent, gas),
// laboratory values, taking an entry back, and the cards that ask the clinician a question.

test.describe("things that keep running on the timetable", () => {
  test("an infusion is started from the sheet, runs in the row, and reaches the server", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Infusion", { exact: true }).first().click()
    await page.getByText("Sedation", { exact: true }).click()
    await page.getByText("Propofol", { exact: true }).first().click()
    await page.getByText("Start Propofol 6 mg/kg/hr", { exact: true }).click()

    await expect(page.getByText("Start Propofol 6 mg/kg/hr", { exact: true })).toHaveCount(0)
    await expectSaved(request, session, /infusion_start/, "the infusion start never reached the server")
    await expectSaved(request, session, /Propofol/, "the infusion's drug never reached the server")
    // A running item is listed in the row, where it can be managed.
    await expect(page.getByText("Running", { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Propofol", { exact: false }).first()).toBeVisible()
  })

  test("a volatile agent is started from the sheet and reaches the server", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Agent", { exact: true }).first().click()
    await page.getByText("Sevoflurane", { exact: true }).click()
    await page.getByText("Start Sevoflurane", { exact: true }).click()

    await expect(page.getByText("Start Sevoflurane", { exact: true })).toHaveCount(0)
    await expectSaved(request, session, /agent_start/, "the agent start never reached the server")
    await expectSaved(request, session, /Sevoflurane/, "the agent never reached the server")
  })

  test("gas settings are started with the carrier gas chosen and reach the server", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("FGF", { exact: true }).first().click()
    await page.getByText("Air", { exact: true }).click()
    await page.getByText("+", { exact: true }).first().click()
    await page.getByText("Start", { exact: true }).last().click()

    await expectSaved(request, session, /gas_start/, "the gas start never reached the server")
    await expectSaved(request, session, /"carrierGas":"air"/, "the carrier gas never reached the server")
  })
})

test.describe("laboratory values", () => {
  test("a blood gas value typed by hand is kept on the case", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Labs", { exact: true }).first().click()
    await page.getByText("Manual lab entry", { exact: true }).click()
    await page.getByText("Blood Gas", { exact: true }).click()
    await page.getByText("PaO₂ (mmHg)", { exact: true }).click()

    const value = page.getByPlaceholder("-")
    await value.fill("85")
    await value.press("Enter")
    await page.getByText("✕", { exact: true }).first().click()

    await expectSaved(request, session, /PaO/, "the lab test never reached the server")
    await expectSaved(request, session, /"value":\s*"?85/, "the lab value never reached the server")
  })
})

test.describe("taking an entry back", () => {
  test("Undo on the toast takes the entry off the chart and the server", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Drug", { exact: true }).first().click()
    await page.getByText("Opioids", { exact: true }).click()
    await page.getByText("Fentanyl", { exact: true }).first().click()
    await page.getByText("Add Fentanyl 10 mcg", { exact: true }).click()
    await expectSaved(request, session, /Fentanyl/, "the drug never reached the server")

    await expect(page.getByText("Undo", { exact: true })).toBeVisible()
    await page.getByText("Undo", { exact: true }).click()
    await expect
      .poll(async () => (await savedChart(request, session)).includes("Fentanyl"), { timeout: 20_000, message: "the undone drug is still on the server" })
      .toBe(false)
  })

  test("an entry removed from the event log is gone from the chart and the server", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Drug", { exact: true }).first().click()
    await page.getByText("Opioids", { exact: true }).click()
    await page.getByText("Fentanyl", { exact: true }).first().click()
    await page.getByText("Add Fentanyl 10 mcg", { exact: true }).click()
    await expectSaved(request, session, /Fentanyl/, "the drug never reached the server")

    page.on("dialog", dialog => { void dialog.accept() })
    await page.getByText("Event log", { exact: true }).click()
    await expect(page.getByText("Fentanyl 10 mcg")).toBeVisible()
    await page.getByText("Remove", { exact: true }).first().click()
    await expect(page.getByText("Fentanyl 10 mcg")).toHaveCount(0, { timeout: 15_000 })
    await expect
      .poll(async () => (await savedChart(request, session)).includes("Fentanyl"), { timeout: 20_000, message: "the removed drug is still on the server" })
      .toBe(false)
  })
})

test.describe("cards that ask a question", () => {
  test.use({ actionTimeout: 10_000 })
  async function withHypotension(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext) {
    const session = await newStartedCase(page, request)
    const posted = await request.post(`${API_BASE}/v1/cases/${session.caseId}/events`, {
      headers: session.authed,
      data: { type: "complication", ts: new Date().toISOString(), label: "Hypotension" },
    })
    expect(posted.ok(), `complication refused: ${posted.status()}`).toBe(true)
    await page.reload()
    // The card opens its own sheet as soon as the case is loaded, on whichever tab the page opens on, so
    // the sheet is what to wait for. Going to the Timetable tab first would race it (and be blocked by it).
    await expect(page.getByText(/· Treat now\?$/)).toBeVisible({ timeout: 30_000 })
    return session
  }

  test("a charted hypotension asks whether to treat, and an answer is charted as the treatment", async ({ page, request }) => {
    const session = await withHypotension(page, request)
    await page.getByText("Ephedrine", { exact: true }).click()
    // The dose sheet opens prefilled with the card's dose.
    await page.getByText("Add Ephedrine 10 mg", { exact: true }).click()

    await expectSaved(request, session, /Ephedrine/, "the treatment never reached the server")
    // The drug carries the card it answered, so the record shows why it was given.
    await expectSaved(request, session, /card:Hypotension/, "the drug does not name the card that asked for it")
  })

  test("Not now sets the question aside without charting anything", async ({ page, request }) => {
    const session = await withHypotension(page, request)
    await page.getByText("Not now", { exact: true }).last().click()
    await expect(page.getByText(/· Treat now\?$/)).toHaveCount(0, { timeout: 15_000 })
    // The question is gone from the waiting list too, not only from the sheet.
    await page.getByText("Timetable", { exact: true }).click()
    await expect(page.getByText(/Hypotension: treat now\?/)).toHaveCount(0)
    expect(await savedChart(request, session)).not.toMatch(/Ephedrine|Phenylephrine|Metaraminol/)
  })
})
