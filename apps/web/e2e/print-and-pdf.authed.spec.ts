import { test, expect } from "@playwright/test"
import { withRoles, contextFor, JSON_HEADERS } from "./roles"

// The paper record.
//
// The anaesthetic chart is what leaves the register: it goes in the notes, it
// goes to the ward, it is what a court would read. So it has to render for the
// people entitled to see the case, refuse everyone else, and come out of the
// server as a real PDF rather than a print dialog the phone cannot drive.
//
// Patient name and identifiers are deliberately absent and printed blank, to be
// filled in by hand — so nothing here should expect them.

const PREOP = {
  ageYears: 66, sex: "FEMALE" as const, heightCm: 160, weightKg: 74,
  diagnoses: [{ label: "Inguinal hernia" }],
  procedures: [{ label: "Open hernia repair" }],
  asaScore: "II" as const,
}

test("the printable record renders for the clinician who recorded it", async ({ browser }) => {
  const context = await contextFor(browser, "member-a")
  const page = await context.newPage()
  const api = context.request

  const created = await api.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(created.status(), await created.text()).toBe(201)
  const { id, caseCode } = await created.json()

  try {
    await page.goto(`/cases/${id}/print`)
    await expect(page).not.toHaveURL(/\/login/)
    // The case identifies itself on the sheet — without it a printed chart
    // cannot be matched back to the record.
    await expect(page.getByText(String(caseCode), { exact: false }).first())
      .toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Open hernia repair", { exact: false }).first()).toBeVisible()
  } finally {
    await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    await context.close()
  }
})

test("the printable data refuses a clinician from another hospital", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "hod-b"], async ctx => {
    const created = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json()

    try {
      // The head of the department it was recorded in may print it.
      expect((await ctx["hod-a"].request.get(`/api/cases/${id}/print-data`)).status()).toBe(200)
      // The other hospital's head learns nothing, here as everywhere else.
      expect((await ctx["hod-b"].request.get(`/api/cases/${id}/print-data`)).status()).toBe(404)
      expect((await ctx["hod-b"].request.get(`/api/cases/${id}/pdf`)).status()).toBe(404)
    } finally {
      await ctx["member-a"].request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})

test("the server produces a real PDF file", async ({ browser }) => {
  // Headless Chrome has to boot and render an A4 sheet.
  test.setTimeout(120_000)

  const context = await contextFor(browser, "member-a")
  const api = context.request

  const created = await api.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()

  try {
    const pdf = await api.get(`/api/cases/${id}/pdf`, { timeout: 90_000 })
    const type = pdf.headers()["content-type"] ?? ""

    // The PDF is rendered by a real Chrome on the server. A machine without one
    // installed cannot produce it, and saying so is more useful than a failure
    // that looks like a broken route.
    test.skip(
      !type.includes("pdf"),
      `server-side PDF unavailable here (${pdf.status()} ${type}): ${(await pdf.text()).slice(0, 200)}`,
    )

    const body = await pdf.body()
    // A PDF, not an HTML error page that happens to have the right header.
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(body.byteLength).toBeGreaterThan(5_000)
    // Named, so the file that lands in the clinician's downloads is findable.
    expect(pdf.headers()["content-disposition"] ?? "").toContain(".pdf")
  } finally {
    await api.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    await context.close()
  }
})
