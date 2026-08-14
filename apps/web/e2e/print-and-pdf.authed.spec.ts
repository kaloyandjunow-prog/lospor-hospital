import { test, expect } from "@playwright/test"
import { withRoles, contextFor, JSON_HEADERS } from "./roles"

// The paper record is authorized printable HTML. Hospital 1.0.0 deliberately
// has no server-side PDF renderer: the clinician uses the browser's Print UI
// and may select Save as PDF only when the device offers it. These tests are a
// release gate and contain no environment-dependent skip.

const PREOP = {
  ageYears: 66, sex: "FEMALE" as const, heightCm: 160, weightKg: 74,
  diagnoses: [{ label: "Inguinal hernia" }],
  procedures: [{ label: "Open hernia repair" }],
  asaScore: "II" as const,
}

test("the printable record renders and states the browser-owned print contract", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  const api = context.request

  const patientNumber = `PRINT-E2E-${Date.now()}-A`
  const created = await api.post("/api/cases", {
    headers: JSON_HEADERS,
    data: { patientNumber, preop: PREOP },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { id, caseCode } = await created.json()

  try {
    await page.goto(`/cases/${id}/print`)
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByText(String(caseCode), { exact: false }).first())
      .toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Open hernia repair", { exact: false }).first()).toBeVisible()
    await expect(page.locator("body")).not.toContainText(patientNumber)
    await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeVisible()
    await expect(page.getByText(/does not generate or download a PDF on the server/)).toBeVisible()
    await expect(page.getByRole("link", { name: /Download PDF/i })).toHaveCount(0)
    await expect(page.locator('a[href*="/pdf"]')).toHaveCount(0)
  } finally {
    await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    await context.close()
  }
})

test("print access remains scoped to the case's institution", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "hod-b"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS,
      data: { patientNumber: `PRINT-E2E-${Date.now()}-B`, preop: PREOP },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()

    try {
      expect((await ctx["hod-a"].request.get(`/api/cases/${id}/print-data`)).status()).toBe(200)
      expect((await ctx["hod-b"].request.get(`/api/cases/${id}/print-data`)).status()).toBe(404)

      const ownLink = await ctx["hod-a"].request.post(`/api/cases/${id}/print-token`, {
        headers: JSON_HEADERS,
        data: { lang: "bg" },
      })
      expect(ownLink.status(), await ownLink.text()).toBe(200)
      const contract = await ownLink.json()
      expect(contract).toMatchObject({ format: "html", action: "print" })
      expect(contract).not.toHaveProperty("pdfUrl")
      expect(contract.url).toContain(`/cases/${id}/print?`)
      expect(contract.url).toContain("print_token=")
      expect(contract.url).toContain("lang=bg")

      const otherLink = await ctx["hod-b"].request.post(`/api/cases/${id}/print-token`, {
        headers: JSON_HEADERS,
        data: { lang: "en" },
      })
      expect(otherLink.status()).toBe(404)

      // The retired route is explicit JSON for an authorized user, not a 302
      // HTML fallback that a client could mistake for a PDF download.
      const retiredPdf = await ctx["hod-a"].request.get(`/api/cases/${id}/pdf`, {
        maxRedirects: 0,
      })
      expect(retiredPdf.status()).toBe(410)
      expect(retiredPdf.headers()["content-type"] ?? "").toContain("application/json")
      expect(retiredPdf.headers()).not.toHaveProperty("location")
      expect(await retiredPdf.json()).toMatchObject({ code: "PRINTABLE_HTML_ONLY" })

      // An unauthorized institution still learns nothing from the retired path.
      expect((await ctx["hod-b"].request.get(`/api/cases/${id}/pdf`)).status()).toBe(404)
    } finally {
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})
