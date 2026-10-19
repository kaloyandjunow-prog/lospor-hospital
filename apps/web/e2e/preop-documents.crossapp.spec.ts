import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, request, test, type APIRequestContext } from "@playwright/test"
import { STATUS_E2E_BASE, STATUS_E2E_PASSWORD, STATUS_E2E_SESSION_FILE } from "./fixtures/status-e2e"
import { contextFor, JSON_HEADERS } from "./roles"

// The preop summary page and the written consent, switched on the way an
// operator does it: in Status, in a browser. 1.6.0 shipped the Status screens
// with nothing behind them in the API, so they never appeared and no site
// could turn the summary on. Unit tests passed on both sides; only this kind
// of test, through the real API, would have seen it.

type Documents = {
  summaryEnabled: boolean
  consentEnabled: boolean
  layout: string
  templates: Record<"ADULT" | "PEDIATRIC", { version: number; title: string }>
}

const ADULT = {
  ageYears: 52, sex: "FEMALE" as const, heightCm: 165, weightKg: 70,
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
}

function controlToken(): string {
  return readFileSync(path.join(__dirname, "fixtures", "status-account-control-token"), "utf8").trim()
}

async function withControl<T>(run: (control: APIRequestContext) => Promise<T>): Promise<T> {
  const control = await request.newContext({ baseURL: process.env.E2E_API_BASE })
  try {
    return await run(control)
  } finally {
    await control.dispose()
  }
}

/** What Status reads: the control-plane view's documents. */
function readDocuments(): Promise<Documents> {
  return withControl(async control => {
    const response = await control.get("/v1/internal/hospital/control-plane", {
      headers: { Authorization: "Bearer " + controlToken() },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    const view = await response.json() as { preoperative: { documents?: Documents } }
    expect(view.preoperative.documents, "the API sends Status no preop documents").toBeDefined()
    return view.preoperative.documents!
  })
}

/** Both off again, so other specs see a site nobody has configured. */
function switchOff(): Promise<void> {
  return withControl(async control => {
    const response = await control.post("/v1/internal/hospital/control-plane/preop-documents", {
      headers: { Authorization: "Bearer " + controlToken(), "Content-Type": "application/json" },
      data: { summaryEnabled: false, consentEnabled: false, layout: "B", reason: "E2E: switch the summary off again" },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
  })
}

test.describe("preop summary and consent, switched on in Status", () => {
  test("the summary page appears for clinicians and the consent prints the saved text", async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    const created = await web.request.post("/api/cases", {
      headers: JSON_HEADERS,
      data: { patientNumber: `PREOP-DOCUMENTS-${Date.now()}`, clinicalMode: "ADULT", preop: ADULT },
    })
    expect(created.status(), await created.text()).toBe(201)
    const caseId = (await created.json() as { id: string }).id

    const context = await browser.newContext({ baseURL: STATUS_E2E_BASE })
    await context.addCookies([
      { name: "lospor_status_session", value: readFileSync(STATUS_E2E_SESSION_FILE, "utf8").trim(), url: STATUS_E2E_BASE },
      { name: "lospor_status_locale", value: "en", url: STATUS_E2E_BASE },
    ])
    const status = await context.newPage()
    try {
      // Off: the summary page sends the clinician back to the preop form.
      const page = await web.newPage()
      await page.goto(`/cases/${caseId}/preop-summary`)
      await expect(page).toHaveURL(/\/cases\/new\?continue=/)

      // 1. Switch both on with layout C, in Status.
      await status.goto("/status/control/preop#preop-documents")
      const switches = status.locator('form[action^="/status/control/preop-documents"]')
      await expect(switches).toBeVisible()
      await switches.getByTestId("preop-summary-switch").check()
      await switches.getByTestId("preop-consent-switch").check()
      await switches.getByTestId("preop-layout-C").check()
      await switches.locator('input[name="reason"]').fill("E2E: the summary and consent go live")
      await switches.locator('input[name="password"]').fill(STATUS_E2E_PASSWORD)
      await switches.locator('button[type="submit"]').click()
      await expect(status.getByText("The preop summary and consent settings were saved")).toBeVisible()
      expect(await readDocuments()).toMatchObject({ summaryEnabled: true, consentEnabled: true, layout: "C" })

      // 2. Save the adults' consent text as its first version.
      await status.goto("/status/control/preop#consent-adults")
      const adults = status.locator('form[action="/status/control/consent-template#consent-adults"]')
      await adults.locator('input[name="title"]').fill("E2E informed consent")
      await adults.locator('textarea[name="body"]').fill("## Обща анестезия [general]\n\nE2E text for {{hospital}}.")
      await adults.locator('input[name="reason"]').fill("E2E: the legal team's text")
      await adults.locator('input[name="password"]').fill(STATUS_E2E_PASSWORD)
      await adults.locator('button[type="submit"]').click()
      await expect(status.getByText("The consent text was saved as a new version")).toBeVisible()
      const documents = await readDocuments()
      expect(documents.templates.ADULT.title).toBe("E2E informed consent")
      expect(documents.templates.ADULT.version).toBeGreaterThanOrEqual(1)

      // 3. The clinician now reaches the summary page, with the consent.
      await page.goto(`/cases/${caseId}/preop-summary`)
      await expect(page.getByTestId("preop-summary-page")).toBeVisible()
      await expect(page.getByTestId("preop-summary-open-print")).toContainText(/consent/i)
    } finally {
      await switchOff()
      await context.close()
    }
  })
})
