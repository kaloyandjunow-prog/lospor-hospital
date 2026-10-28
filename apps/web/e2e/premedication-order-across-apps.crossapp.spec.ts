import path from "path"
import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhoneIntraop, openPhonePreop } from "./pwa"

// Premedication ordered at the preop visit, carried into the intraoperative
// record on the other app.
//
// The order is written in one app and the intraop record opened in the other,
// both ways round, because the prefill runs in whichever client opens the
// record: a phase that is empty starts as ordered, says so, and offers an edit
// button; a phase already answered ("N/A") is left alone. Each step is checked
// against the server, not only the screen that did it.

test.describe.configure({ timeout: 240_000 })

const PREOP = {
  ageYears: 44, sex: "MALE" as const, heightCm: 180, weightKg: 82, clinicalMode: "ADULT",
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
}

type CaseBody = {
  preop?: { preopPremedicationOrders?: { DAY_BEFORE?: string | null; MORNING?: string | null } }
  intraop?: { premedicationEvening?: string | null; premedicationMorning?: string | null }
}

async function createCase(web: BrowserContext, intraop?: Record<string, unknown>): Promise<string> {
  const response = await web.request.post("/api/cases", {
    headers: JSON_HEADERS, data: { preop: PREOP, ...(intraop ? { intraop } : {}) },
  })
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json() as { id: string }).id
}

async function server(web: BrowserContext, id: string): Promise<CaseBody> {
  return await (await web.request.get(`/api/cases/${id}`)).json() as CaseBody
}

/** Picks drug, keeps its default dose and route, and adds it, in the web picker. */
async function webPick(page: Page, picker: Locator, category: string, drug: string) {
  await picker.locator("button").first().click()
  await page.getByRole("button", { name: category, exact: true }).click()
  await page.getByRole("button", { name: drug, exact: true }).click()
  await page.getByRole("button", { name: new RegExp(`^Add .*${drug} `) }).click()
}

/** Screenshots for a person to look at, kept apart so a rerun's cleanup does not wipe them. */
const SHOTS = process.env.PREMED_SHOTS_DIR ?? path.join(__dirname, "..", "test-results", "premed-shots")
async function shot(page: Page, name: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

async function openWebIntraopPremedication(page: Page, id: string) {
  await page.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))
  await page.goto(`/cases/new?continue=${id}&step=1`, { waitUntil: "domcontentloaded" })
  // A started case shows intraop as tabs; one not yet started, as one page.
  const tab = page.getByRole("tab", { name: "Anaesthesia" })
  if (await tab.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false)) await tab.click()
  await page.getByText("Premedication", { exact: true }).first().click()
  await expect(page.getByTestId("premedication-evening")).toBeVisible()
}

test.describe("premedication ordered at the preop visit", () => {
  test("ordered on the web, the phone's intraop record starts from it", async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    const id = await createCase(web)
    const page = await web.newPage()
    await page.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))

    try {
      await page.goto(`/cases/new?continue=${id}`)
      await page.waitForLoadState("networkidle")
      const night = page.getByTestId("preop-premedication-night")
      await night.scrollIntoViewIfNeeded()
      await expect(night).toContainText("The night before surgery")
      // An order has no "not applicable": nothing ordered is no order.
      await night.locator("button").first().click()
      await expect(page.getByRole("button", { name: "N/A", exact: true })).toHaveCount(0)
      await page.keyboard.press("Escape")
      await page.mouse.click(5, 5)

      await webPick(page, night, "Anxiolytics", "Midazolam")
      await webPick(page, page.getByTestId("preop-premedication-morning"), "Acid suppression / antacids", "Pantoprazole")

      await night.scrollIntoViewIfNeeded()
      await shot(page, "1-web-preop-order")

      await expect.poll(async () => (await server(web, id)).preop?.preopPremedicationOrders, { timeout: 20_000 })
        .toEqual({ DAY_BEFORE: expect.stringMatching(/^Midazolam /), MORNING: expect.stringMatching(/^Pantoprazole /) })
      const ordered = (await server(web, id)).preop!.preopPremedicationOrders!

      const { context: phoneCtx, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
      try {
        await openPhoneIntraop(phone, id)
        await phone.getByText("Premedication", { exact: true }).first().click()
        await expect(phone.getByText("The night before surgery", { exact: true })).toBeVisible()

        // The web page still holds the case, so the phone is only watching and
        // can save nothing: the order must wait rather than look applied.
        await expect(phone.getByText(/Being edited on another device/)).toBeVisible()
        await expect(phone.getByTestId("premed-as-ordered-evening")).toHaveCount(0)
        await shot(phone, "2a-phone-intraop-watching-waits")
        expect((await server(web, id)).intraop?.premedicationEvening ?? null).toBeNull()
        await phone.getByText("Take over", { exact: true }).click()
        await phone.getByText("Confirm", { exact: true }).click()

        await expect(phone.getByTestId("premed-as-ordered-evening")).toBeVisible()
        await expect(phone.getByTestId("premed-as-ordered-morning")).toBeVisible()
        await expect(phone.getByText(/^Midazolam /).first()).toBeVisible()
        await shot(phone, "2b-phone-intraop-after-take-over-as-ordered")

        // The prefill is saved, in one save, not only shown.
        await expect.poll(async () => (await server(web, id)).intraop, { timeout: 20_000 })
          .toMatchObject({ premedicationEvening: ordered.DAY_BEFORE, premedicationMorning: ordered.MORNING })

        // Edit opens the library; adding a drug ends "as ordered".
        await phone.getByTestId("premed-edit-ordered-evening").click()
        await shot(phone, "3-phone-intraop-edit-opens-library")
        await phone.getByText("Antiemetics", { exact: true }).click()
        await phone.getByText("Ondansetron", { exact: true }).click()
        await phone.getByText(/^Add to /).click()
        await expect(phone.getByTestId("premed-as-ordered-evening")).toHaveCount(0)
        await expect(phone.getByTestId("premed-as-ordered-morning")).toBeVisible()
        await expect.poll(async () => (await server(web, id)).intraop?.premedicationEvening, { timeout: 20_000 })
          .toMatch(/Ondansetron/)
        await shot(phone, "4-phone-intraop-after-edit")

        // Reopened, the edit stands: an applied order is not applied again.
        await openPhoneIntraop(phone, id)
        await phone.getByText("Premedication", { exact: true }).first().click()
        await expect(phone.getByText(/^Ondansetron /).first()).toBeVisible()
        await expect(phone.getByTestId("premed-as-ordered-evening")).toHaveCount(0)
      } finally {
        await phoneCtx.close()
      }
    } finally {
      await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })

  test("ordered on the phone, the web intraop record starts from it and leaves N/A alone", async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    const id = await createCase(web, { premedicationMorning: "N/A" })
    const { context: phoneCtx, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)

    try {
      await openPhonePreop(phone, id, "Premedication")
      for (const [phase, category, drug] of [["evening", "Anxiolytics", "Midazolam"], ["morning", "Acid suppression / antacids", "Pantoprazole"]] as const) {
        await phone.getByTestId(`preop-premedication-add-${phase}`).click()
        await phone.getByText(category, { exact: true }).click()
        await phone.getByText(drug, { exact: true }).click()
        await phone.getByText(/^Add to /).click()
        await expect(phone.getByTestId(`preop-premedication-${phase}`)).toContainText(drug)
      }
      await phone.getByTestId("preop-premedication-order").scrollIntoViewIfNeeded()
      await shot(phone, "5-phone-preop-order")
      await expect.poll(async () => (await server(web, id)).preop?.preopPremedicationOrders, { timeout: 20_000 })
        .toEqual({ DAY_BEFORE: expect.stringMatching(/^Midazolam /), MORNING: expect.stringMatching(/^Pantoprazole /) })
      const ordered = (await server(web, id)).preop!.preopPremedicationOrders!

      const page = await web.newPage()
      await openWebIntraopPremedication(page, id)
      const evening = page.getByTestId("premedication-evening")
      const morning = page.getByTestId("premedication-morning")
      await expect(evening).toContainText("The night before surgery")
      await expect(evening.getByTestId("premedication-as-ordered")).toBeVisible()
      await expect(evening.getByTestId("premedication-edit-ordered")).toBeVisible()
      await expect(evening).toContainText("Midazolam")
      // Already answered at intraop: not overwritten, and not "as ordered".
      await expect(morning.getByTestId("premedication-as-ordered")).toHaveCount(0)
      await expect(morning).not.toContainText("Pantoprazole")
      await evening.scrollIntoViewIfNeeded()
      await shot(page, "6-web-intraop-prefilled-na-kept")

      await expect.poll(async () => (await server(web, id)).intraop, { timeout: 30_000 })
        .toMatchObject({ premedicationEvening: ordered.DAY_BEFORE, premedicationMorning: "N/A" })

      // The edit button opens the picker on the drug list.
      await evening.getByTestId("premedication-edit-ordered").click()
      await expect(page.getByRole("button", { name: "Anxiolytics", exact: true })).toBeVisible()
      await shot(page, "7-web-intraop-edit-opens-picker")
    } finally {
      await phoneCtx.close()
      await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})
