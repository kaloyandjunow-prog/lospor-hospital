import { expect, test } from "@playwright/test"
import { ACCOUNTS, API_BASE, signInAs, tokenFor } from "./session"

test("a hidden canonical drug is available only as provenance-preserving manual entry", async ({ page, request }) => {
  await page.route("**/clinical/rules/runtime?mode=ADULT", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "ADULT",
        preset: { id: "institution-hidden-e2e", name: "E2E hidden policy", version: 4, scope: "INSTITUTION" },
        productionReady: true,
        effectiveRules: [{
          id: "institution-propofol-hidden",
          ruleKey: "institution.propofol.hidden",
          ruleVersion: "9",
          payload: {
            kind: "ADULT_DRUG_PROFILE",
            itemKey: "Propofol",
            labelEn: "Propofol",
            labelBg: "Пропофол",
            category: "Induction",
            availability: "HIDDEN",
            profile: {
              kind: "bolus",
              mode: "concentration",
              min: 0,
              max: 500,
              step: 10,
              rounding: "nearest_step",
              quickValues: [50, 100, 200],
              unit: "mg",
              routes: ["IV", "IM"],
              defaultRoute: "IV",
              weightBasis: "TBW",
              doseCalc: { perKg: 2, basis: "TBW", roundTo: 10 },
              concentrationOptions: ["10 mg/mL"],
              formulationOptions: ["ISOBARIC"],
            },
          },
          sourceRefs: ["institution-hidden-e2e-policy"],
          origin: "INSTITUTION",
          presetId: "institution-hidden-e2e",
          overrideId: null,
        }],
        doseProfiles: [],
        adultDoseProfiles: [{
          ruleKey: "institution.propofol.hidden",
          ruleVersion: "9",
          itemKey: "Propofol",
          labelEn: "Propofol",
          labelBg: "Пропофол",
          category: "Induction",
          kind: "ADULT_DRUG_PROFILE",
          availability: "HIDDEN",
          origin: "INSTITUTION",
          presetId: "institution-hidden-e2e",
          unit: null,
          routeUnits: {},
          profile: {
            kind: "bolus",
            mode: "concentration",
            min: 0,
            max: 500,
            step: 10,
            rounding: "nearest_step",
            quickValues: [50, 100, 200],
            unit: "mg",
            routes: ["IV", "IM"],
            defaultRoute: "IV",
            weightBasis: "TBW",
            doseCalc: { perKg: 2, basis: "TBW", roundTo: 10 },
            concentrationOptions: ["10 mg/mL"],
            formulationOptions: ["ISOBARIC"],
          },
        }],
      }),
    })
  })

  const token = await tokenFor(request, ACCOUNTS.admin)
  const created = await request.post(`${API_BASE}/v1/cases`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: {
      preop: {
        procedureName: "Hidden medication PWA regression",
        diagnosis: "E2E",
        asaClass: 1,
        age: 40,
        weight: 70,
        height: 175,
        sex: "MALE",
        urgency: "ELECTIVE",
      },
    },
  })
  expect(created.ok(), `case creation failed: ${created.status()} ${await created.text()}`).toBe(true)
  const caseId: string = (await created.json()).id

  await signInAs(page, request, ACCOUNTS.admin)
  await page.goto(`/cases/intraop/${caseId}`)
  await expect(page.getByText("Equipment", { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByText("Timetable", { exact: true }).click()
  // The quick-add grid lives inside an expanded row, so the current
  // five-minute slot has to be opened before there is a Drug action at all.
  await page.getByTestId("timetable-row-now").click()
  await page.getByTestId("timetable-quick-add-drug").click()

  await expect(page.getByText("Add drug", { exact: true })).toBeVisible()
  await expect(page.getByText("Propofol", { exact: true })).toHaveCount(0)
  await page.getByText("Browse all drugs", { exact: true }).click()
  await expect(page.getByText("Propofol", { exact: true })).toHaveCount(0)
  await page.getByTestId("drug-search-input").fill("Propofol")
  await expect(page.getByText("Propofol", { exact: true })).toBeVisible()
  await expect(page.getByText(/Manual entry only/)).toBeVisible()
  await page.getByText("Propofol", { exact: true }).click()

  await expect(page.getByTestId("drug-search-only-manual-notice")).toBeVisible()
  await expect(page.getByText("10 mg/mL", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/2 mg\/kg/)).toHaveCount(0)
  await page.getByTestId("dose-manual-input").fill("42")

  const eventRequest = page.waitForRequest(candidate => (
    candidate.method() === "POST"
    && candidate.url().includes(`/v1/cases/${caseId}/events`)
  ))
  await page.getByText("Add Propofol 42 mg", { exact: true }).click()
  const payload = (await eventRequest).postDataJSON() as Record<string, unknown>
  expect(payload).toMatchObject({
    type: "drug",
    name: "Propofol",
    dose: "42",
    unit: "mg",
    clinicalRuleKey: "institution.propofol.hidden",
    clinicalRuleVersion: "9",
    clinicalPresetId: "institution-hidden-e2e",
    clinicalPresetVersion: 4,
    clinicalPresetScope: "INSTITUTION",
  })
})

test("a non-production-ready adult baseline cannot prefill any medication value", async ({ page, request }) => {
  await page.route("**/clinical/rules/runtime?mode=ADULT", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "ADULT",
        preset: { id: "adult-not-ready", name: "Adult pending baseline", version: 3, scope: "INSTITUTION" },
        productionReady: false,
        effectiveRules: [{
          id: "adult-propofol-auto",
          ruleKey: "adult.propofol.auto",
          ruleVersion: "3",
          payload: {
            kind: "ADULT_DRUG_PROFILE",
            itemKey: "Propofol",
            labelEn: "Propofol",
            availability: "AUTO",
            profile: {
              kind: "bolus",
              mode: "concentration",
              min: 0,
              max: 500,
              step: 10,
              rounding: "nearest_step",
              quickValues: [50, 100, 200],
              unit: "mg",
              routes: ["IV", "IM"],
              defaultRoute: "IV",
              weightBasis: "TBW",
              doseCalc: { perKg: 2, basis: "TBW", roundTo: 10 },
              concentrationOptions: ["10 mg/mL"],
              defaultConcentration: "10 mg/mL",
            },
          },
          sourceRefs: ["pending-adult-policy"],
          origin: "INSTITUTION",
          presetId: "adult-not-ready",
          overrideId: null,
        }],
        doseProfiles: [],
      }),
    })
  })

  const token = await tokenFor(request, ACCOUNTS.admin)
  const created = await request.post(`${API_BASE}/v1/cases`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: {
      preop: {
        procedureName: "Clinical baseline fail-closed PWA regression",
        diagnosis: "E2E",
        asaClass: 1,
        age: 40,
        weight: 70,
        height: 175,
        sex: "MALE",
        urgency: "ELECTIVE",
      },
    },
  })
  expect(created.ok(), `case creation failed: ${created.status()} ${await created.text()}`).toBe(true)
  const caseId: string = (await created.json()).id

  await signInAs(page, request, ACCOUNTS.admin)
  await page.goto(`/cases/intraop/${caseId}`)
  await expect(page.getByText("Equipment", { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByText("Timetable", { exact: true }).click()
  // The quick-add grid lives inside an expanded row, so the current
  // five-minute slot has to be opened before there is a Drug action at all.
  await page.getByTestId("timetable-row-now").click()
  await page.getByTestId("timetable-quick-add-drug").click()
  await page.getByText("Browse all drugs", { exact: true }).click()
  await page.getByTestId("drug-search-input").fill("Propofol")
  await page.getByText("Propofol", { exact: true }).click()

  await expect(page.getByTestId("dose-manual-input")).toHaveValue("")
  await expect(page.getByText("10 mg/mL", { exact: true })).toHaveCount(0)
  await expect(page.getByText("50", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/2 mg\/kg/)).toHaveCount(0)
})
