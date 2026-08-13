import { expect, test } from "@playwright/test"
import { JSON_HEADERS, withRoles } from "./roles"

// One deliberately broad, synthetic clinical journey. Unit tests prove each
// mapper and validator in detail; this proves the real authenticated services
// still join up as a usable record from admission through research projection.

const STARTED_AT = "2026-05-12T07:30:00.000Z"
const ENDED_AT = "2026-05-12T09:00:00.000Z"

test.describe.configure({ timeout: 120_000 })

test("synthetic preop to finalised record remains visible and research-safe", async ({ browser }) => {
  await withRoles(browser, ["member-a", "research"], async contexts => {
    const clinician = contexts["member-a"]
    const api = clinician.request
    let caseId: string | undefined
    let finalised = false
    const patientNumber = `GOLDEN-E2E-${Date.now()}`
    const procedureCode = `GOLDEN-${Date.now()}`

    try {
      // Create through the actual clinician form. This is intentionally not an
      // API shortcut: the navigation gate, form mapping, patient link and first
      // persisted draft must work together in the browser.
      const page = await clinician.newPage()
      await page.addInitScript(() => localStorage.setItem("preopLayout", "scroll"))
      await page.goto("/cases/new")
      await expect(page).not.toHaveURL(/\/login/)
      const form = page.locator("form")
      const numericInputs = form.locator('input[type="number"]')
      await numericInputs.nth(0).fill("47")
      await numericInputs.nth(1).fill("166")
      await numericInputs.nth(2).fill("69")
      await form.getByRole("button", { name: /Female$/ }).click()

      const diagnosisInput = form.getByPlaceholder(/diagnosis or ICD-10 code/i)
      await diagnosisInput.fill("K35")
      await expect(page.getByText("Acute appendicitis", { exact: true }).first()).toBeVisible()
      await page.getByText("Acute appendicitis", { exact: true }).first().click()
      const procedureInput = form.getByPlaceholder(/procedure name/i)
      await procedureInput.fill("Synthetic procedure")
      await procedureInput.press(",")

      // The synthetic journey records why required observations are absent
      // rather than fabricating measurements merely to pass form validation.
      const vitalsCard = form.locator('[data-slot="card"]').filter({ hasText: "Physical examination — Vitals" })
      const unavailableVitals = vitalsCard.getByRole("button", { name: "Unable to obtain" })
      await unavailableVitals.nth(0).click() // blood pressure
      await unavailableVitals.nth(1).click() // heart rate
      await unavailableVitals.nth(4).click() // respiratory rate
      const airwayCard = form.locator('[data-slot="card"]').filter({ hasText: "Airway evaluation" })
      await airwayCard.getByRole("button", { name: "Unable to obtain" }).click()
      const asaCard = form.locator('[data-slot="card"]').filter({ hasText: "ASA Physical Status Classification" })
      await asaCard.getByRole("button", { name: /II\s+Mild systemic disease/ }).click()

      // Enter the patient number last so background autosave cannot create an
      // incomplete draft before the deliberate Continue action below.
      await form.getByLabel("Hospital patient number").fill(patientNumber)
      const createdResponsePromise = page.waitForResponse(response =>
        response.request().method() === "POST"
        && new URL(response.url()).pathname === "/api/cases",
      )
      await form.getByRole("button", { name: "Continue to Intraoperative" }).click()
      const created = await createdResponsePromise
      expect(created.status(), await created.text()).toBe(201)
      const identity = await created.json()
      caseId = identity.id
      expect(caseId).toBeTruthy()
      expect(identity.patientReference?.maskedIdentifier).toBeTruthy()
      expect(JSON.stringify(identity)).not.toContain(patientNumber)
      await expect.poll(() => new URL(page.url()).searchParams.get("continue")).toBe(caseId)
      await expect(page.getByTestId("masked-patient-identifier")).toHaveText(identity.patientReference.maskedIdentifier)

      // A fresh navigation must reconstruct the preop form from persisted API
      // data, not from the React state that submitted it.
      await page.goto(`/cases/new?continue=${caseId}&step=0`)
      await expect(page.locator('form input[type="number"]').nth(0)).toHaveValue("47")
      await expect(page.getByText("Acute appendicitis", { exact: true }).first()).toBeVisible()
      await expect(page.getByTestId("masked-patient-identifier")).toHaveText(identity.patientReference.maskedIdentifier)
      expect(await page.locator("body").innerText()).not.toContain(patientNumber)

      // The UI's free-text procedure proves browser creation. Add a synthetic
      // code afterwards so this broad flow can still address its research row
      // deterministically without depending on a mutable procedure catalogue.
      const codedProcedure = await api.patch(`/api/cases/${caseId}`, {
        headers: JSON_HEADERS,
        data: {
          preop: {
            procedures: [{ label: "Synthetic procedure", code: procedureCode, system: "LOSPOR-E2E" }],
          },
        },
      })
      expect(codedProcedure.ok(), await codedProcedure.text()).toBeTruthy()

      const intraop = await api.patch(`/api/cases/${caseId}`, {
        headers: JSON_HEADERS,
        data: {
          intraop: {
            startedAt: STARTED_AT,
            endedAt: ENDED_AT,
            timezone: "Europe/Sofia",
            techniques: ["GENERAL"],
          },
        },
      })
      expect(intraop.ok(), await intraop.text()).toBeTruthy()

      const events = [
        {
          id: "golden-vital",
          type: "vital",
          ts: "2026-05-12T07:35:00.000Z",
          systolic: 121,
          diastolic: 74,
          heartRate: 68,
          spo2: 99,
        },
        {
          id: "golden-drug",
          type: "drug",
          ts: "2026-05-12T07:40:00.000Z",
          name: "Fentanyl",
          dose: "100",
          unit: "mcg",
          drugRoute: "IV",
        },
        {
          id: "golden-fluid-start",
          type: "fluid_start",
          ts: "2026-05-12T07:45:00.000Z",
          fluidId: "golden-fluid",
          name: "Ringer Lactate",
          category: "Crystalloids",
          fluidEntryMode: "VOLUME",
          volume: "500",
        },
        {
          id: "golden-fluid-end",
          type: "fluid_end",
          ts: "2026-05-12T08:45:00.000Z",
          fluidId: "golden-fluid",
          administeredVolumeMl: 500,
        },
      ]
      for (const event of events) {
        const response = await api.post(`/api/cases/${caseId}/events`, {
          headers: JSON_HEADERS,
          data: event,
        })
        expect(response.ok(), `${event.type}: ${await response.text()}`).toBeTruthy()
      }

      const postop = await api.patch(`/api/cases/${caseId}`, {
        headers: JSON_HEADERS,
        data: {
          postop: {
            aldreteActivity: 2,
            aldreteRespiration: 2,
            aldreteCirculation: 2,
            aldreteConsciousness: 2,
            aldreteSpO2: 2,
            disposition: "WARD",
          },
        },
      })
      expect(postop.ok(), await postop.text()).toBeTruthy()

      const beforeFinalise = await api.get(`/api/cases/${caseId}`)
      expect(beforeFinalise.ok(), await beforeFinalise.text()).toBeTruthy()
      const record = await beforeFinalise.json()
      expect(record.preop.ageYears).toBe(47)
      expect(record.patientReference?.maskedIdentifier).toBeTruthy()
      expect(JSON.stringify(record)).not.toContain(patientNumber)
      expect(record.intraop.crystalloidsMl).toBe(500)
      expect(Array.isArray(record.intraop.keyEvents?.vitals)).toBeTruthy()
      expect(record.intraop.keyEvents.vitals.some((entry: unknown) => entry != null)).toBeTruthy()
      expect(Array.isArray(record.intraop.keyEvents?.drugs)).toBeTruthy()
      expect(record.intraop.keyEvents.drugs.length).toBeGreaterThan(0)
      expect(record.postop.aldreteTotal).toBe(10)

      const completed = await api.post(`/api/cases/${caseId}/finalize`, {
        headers: JSON_HEADERS,
      })
      expect(completed.status(), await completed.text()).toBe(200)
      finalised = true

      // Reopen the real clinical page after finalisation: persistence through
      // the API alone would not catch a broken server/client hand-off.
      await page.goto(`/cases/${caseId}`)
      await expect(page).not.toHaveURL(/\/login/)
      if (identity.caseCode) {
        await expect(page.getByText(String(identity.caseCode), { exact: false }).first())
          .toBeVisible({ timeout: 20_000 })
      }
      await page.reload()
      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.getByText(/47y/).first()).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText("Fentanyl", { exact: true }).first()).toBeVisible()
      const chart = page.locator("svg.timetable-svg").first()
      await expect(chart).toBeVisible()
      await expect.poll(() => chart.evaluate(node => node.textContent ?? "")).toContain("121/74")
      await expect.poll(() => chart.evaluate(node => node.textContent ?? "")).toContain("68")
      const crystalloid = page.getByText("Crystalloid", { exact: true }).first().locator("..")
      await expect(crystalloid).toContainText("500")
      const aldrete = page.getByText("Aldrete total", { exact: true }).first().locator("..")
      await expect(aldrete).toContainText("10 / 10")

      const persisted = await api.get(`/api/cases/${caseId}`).then(response => response.json())
      expect(persisted.status).toBe("COMPLETE")
      expect(persisted.finalizedAt).toBeTruthy()
      expect(persisted.intraop.crystalloidsMl).toBe(500)
      expect(persisted.intraop.keyEvents.vitals.some((entry: unknown) => entry != null)).toBeTruthy()
      expect(persisted.intraop.keyEvents.drugs.length).toBeGreaterThan(0)
      expect(persisted.postop.aldreteTotal).toBe(10)

      // The research account can see only a disclosure-safe aggregate. The
      // exact case and its clinical contents must never appear in this reply.
      const research = await contexts.research.request.post("/api/research/query", {
        headers: JSON_HEADERS,
        data: {
          cohort: {
            version: 1,
            filters: { procedureCodes: [procedureCode] },
          },
        },
      })
      expect(research.ok(), await research.text()).toBeTruthy()
      const projection = await research.json()
      const researchJson = JSON.stringify(projection)
      expect(projection.cases).toEqual([])
      expect(projection.pagination).toBeNull()
      expect(researchJson).not.toContain(patientNumber)
      expect(researchJson).not.toContain(identity.patientReference.maskedIdentifier)
      expect(projection.matchingCaseCount.upperBound).toBeGreaterThanOrEqual(1)
      expect(
        projection.matchingCaseCount.value !== 0,
        "the finalised synthetic case was absent from the research projection",
      ).toBeTruthy()
    } finally {
      // Finalised records are intentionally immutable and the suite seeder
      // clears them on its next run. Drafts are removed immediately on failure.
      if (caseId && !finalised) {
        await api.delete(`/api/cases/${caseId}`, { headers: JSON_HEADERS }).catch(() => {})
      }
    }
  })
})
