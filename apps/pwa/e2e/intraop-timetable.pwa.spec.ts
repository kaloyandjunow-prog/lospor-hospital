import { expect, test } from "@playwright/test"
import { API_BASE } from "./session"
import { expectSaved, newStartedCase, openStartRow, savedChart } from "./intraop-helpers"

// The intraop timetable, driven the way a clinician drives it on a phone.
//
// Every test creates its own case through the API, starts it on the screen, and
// then charts through the real sheets. What was charted is checked twice: on the
// screen (the row and the toast), and on the server, because a chart that shows
// an entry the API never received is the failure that matters most at 2am.

test.describe("the intraop timetable", () => {
  test("starting the case puts the anaesthesia start in the first row and saves it", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await expect(page.getByText("Anaesthesia start", { exact: true }).first()).toBeVisible()
    for (const pill of ["Vitals", "Drug", "Infusion", "Fluid", "Agent", "Labs", "Event"]) {
      await expect(page.getByText(pill, { exact: true }).first()).toBeVisible()
    }
    await expectSaved(request, session, /Anaesthesia start/, "the start event never reached the server")
  })

  test("vitals entered in the sheet appear in their row and reach the server", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Vitals", { exact: true }).first().click()

    await page.getByPlaceholder("Sys").fill("128")
    await page.getByPlaceholder("Dia").fill("76")
    const bare = page.getByPlaceholder("-")
    await bare.nth(0).fill("64")
    await bare.nth(1).fill("98")
    await page.getByText("Save vitals", { exact: true }).click()

    await expect(page.getByText("Save vitals", { exact: true })).toHaveCount(0)
    // The row's own summary, not only the toast: this is what the clinician reads back.
    await expect(page.getByText("128/76").first()).toBeVisible({ timeout: 15_000 })
    await expectSaved(request, session, /"systolic":\s*128/, "the systolic never reached the server")
    await expectSaved(request, session, /"diastolic":\s*76/, "the diastolic never reached the server")
    await expectSaved(request, session, /"heartRate":\s*64/, "the heart rate never reached the server")
    await expectSaved(request, session, /"spO2":\s*98/, "the SpO2 never reached the server")
  })

  test("a vital that is out of range is refused instead of saved", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Vitals", { exact: true }).first().click()

    await page.getByPlaceholder("-").nth(1).fill("140") // SpO2 over 100 is not a measurement
    // The sheet says why, and the save button is disabled rather than quietly saving 140.
    await expect(page.getByText("SpO₂ must be between 0 and 100.")).toBeVisible()
    await expect(page.locator("[aria-disabled=true]", { hasText: "Save vitals" })).toBeVisible()
    await page.waitForTimeout(1500)
    expect(await savedChart(request, session)).not.toMatch(/"spO2":\s*140/)
  })

  test("a drug bolus is charted with its dose and reaches the server", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Drug", { exact: true }).first().click()
    await page.getByText("Opioids", { exact: true }).click()
    await page.getByText("Fentanyl", { exact: true }).first().click()
    await page.getByText("50", { exact: true }).first().click()
    await page.getByText("Add Fentanyl 50 mcg", { exact: true }).click()

    await expect(page.getByText("Add Fentanyl 50 mcg", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Fentanyl", { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    await expectSaved(request, session, /Fentanyl/, "the drug never reached the server")
    await expectSaved(request, session, /"dose":\s*"?50/, "the dose never reached the server")
  })

  test("a fluid bag is charted and reaches the server", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Fluid", { exact: true }).first().click()
    await page.getByText("Ringer's lactate (Hartmann's)", { exact: true }).click()
    await page.getByText("Add Ringer's lactate (Hartmann's) 500 mL", { exact: true }).click()

    await expect(page.getByText("Add Fluid", { exact: true })).toHaveCount(0)
    await expectSaved(request, session, /Ringer/, "the fluid never reached the server")
  })

  test("a clinical event is charted from the event picker", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Event", { exact: true }).first().click()
    await page.getByText("Surgical", { exact: true }).click()
    await page.getByText("Incision", { exact: true }).first().click()

    await expectSaved(request, session, /Incision/, "the event never reached the server")
  })

  test("what was charted is still there after the page is reloaded", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await openStartRow(page, session.rowTime)
    await page.getByText("Vitals", { exact: true }).first().click()
    await page.getByPlaceholder("Sys").fill("117")
    await page.getByPlaceholder("Dia").fill("71")
    await page.getByText("Save vitals", { exact: true }).click()
    await expectSaved(request, session, /"systolic":\s*117/, "the vitals never reached the server")

    await page.reload()
    await expect(page.getByText("Equipment", { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByText("Timetable", { exact: true }).click()
    await expect(page.getByText("117/71").first()).toBeVisible({ timeout: 20_000 })
    // The case is already started, so the page offers no second start.
    await expect(page.getByText("Start now", { exact: false })).toHaveCount(0)
  })

  test("a case with no technique cannot be ended, and says why", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await expectSaved(request, session, /Anaesthesia start/, "the start event never reached the server")
    const dialogs: string[] = []
    page.on("dialog", dialog => { dialogs.push(dialog.message()); void dialog.accept() })
    await page.getByText("End case", { exact: true }).click()
    await expect.poll(() => dialogs.join(" "), { timeout: 10_000 }).toContain("Anaesthesia technique")
    expect(dialogs.join(" ")).toContain("Complete before ending the case")
    // Nothing ended: the end modal never opened.
    await expect(page.getByText("End now", { exact: true })).toHaveCount(0)
  })

  test("a case that has its technique can be ended, and the chart then reads as ended", async ({ page, request }) => {
    const session = await newStartedCase(page, request)
    await expectSaved(request, session, /Anaesthesia start/, "the start event never reached the server")
    const patched = await request.patch(`${API_BASE}/v1/cases/${session.caseId}`, {
      headers: session.authed,
      data: { intraop: { techniques: ["REGIONAL_SPINAL"] } },
    })
    expect(patched.ok(), `technique patch failed: ${patched.status()}`).toBe(true)

    await page.reload()
    await expect(page.getByText("Equipment", { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByText("Timetable", { exact: true }).click()
    const dialogs: string[] = []
    page.on("dialog", dialog => { dialogs.push(dialog.message()); void dialog.accept() })
    await page.getByText("End case", { exact: true }).click()
    // A bare case is incomplete in places the clinician may knowingly leave, so it asks and does not forbid.
    await expect.poll(() => dialogs.join(" "), { timeout: 10_000 }).toContain("Some sections look incomplete")
    await expect(page.getByText("End now", { exact: true })).toBeVisible()
    await page.getByText("End now", { exact: true }).click()

    // Anything charted after the end has to be answered for before the case can move on.
    await expect(page.getByText("Entries after the end time")).toBeVisible()
    await page.getByText("Happened", { exact: true }).click()
    await page.getByText("Continue to Postoperative", { exact: false }).click()

    // The chart reads as ended and offers a way back, for the case ended by mistake.
    await expect(page.getByText("Case ended", { exact: false })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Resume", { exact: false }).first()).toBeVisible()
    await expectSaved(request, session, /"endedAt":"\d{4}-/, "the end of the case never reached the server")

    // Only then does the screen offer the way on.
    await page.getByText("Continue to Postoperative", { exact: false }).click()
    await expect(page).toHaveURL(/postop/, { timeout: 20_000 })
  })
})
