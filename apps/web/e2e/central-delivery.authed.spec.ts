import { expect, test } from "@playwright/test"
import { acceptCentralAction } from "./fixtures/central-checkpoint"
import { JSON_HEADERS, withRoles } from "./roles"

const COMPLETE_PREOP = {
  ageYears: 48,
  sex: "FEMALE" as const,
  heightCm: 166,
  weightKg: 69,
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 124,
  bpDiastolic: 76,
  heartRate: 68,
  respiratoryRate: 14,
  mallampati: "II" as const,
  asaScore: "II" as const,
}

test("authenticated Hospital Web exposes only the bounded Central delivery list", async ({ page }) => {
  const response = await page.request.get("/api/hospital/central-cases?page=0")
  expect(response.ok(), `Central list failed: ${response.status()}`).toBeTruthy()
  const body = await response.json()
  expect(Object.keys(body).sort()).toEqual(["cases", "page", "pageSize", "schemaVersion", "total"])
  for (const item of body.cases) {
    expect(Object.keys(item).sort()).toEqual(["caseId", "control", "finalizedAt"])
    expect(JSON.stringify(item)).not.toMatch(/patient|assignee|caseCode|pseudonym|batchId|reasonNote/i)
  }

  await page.goto("/central-delivery")
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole("heading", { name: /Central delivery|Изпращане към Central/i })).toBeVisible()
  await expect(page.getByText(/include or approve|включване или одобрение/i)).toHaveCount(0)
})

test("the clinician who finalised a case holds its Central authority, its creator does not", async ({ browser }) => {
  await withRoles(browser, ["member-a", "hod-a", "member-a2"], async contexts => {
    const creator = contexts["member-a"]
    const hod = contexts["hod-a"]
    const finalizer = contexts["member-a2"]

    const created = await creator.request.post("/api/cases", {
      headers: JSON_HEADERS,
      data: { patientNumber: `CENTRAL-E2E-${Date.now()}`, preop: COMPLETE_PREOP },
    })
    expect(created.status(), await created.text()).toBe(201)
    const { id } = await created.json() as { id: string }

    const completed = await creator.request.patch(`/api/cases/${id}`, {
      headers: JSON_HEADERS,
      data: {
        intraop: {
          startedAt: "2026-06-18T07:30:00.000Z",
          endedAt: "2026-06-18T09:00:00.000Z",
          timezone: "Europe/Sofia",
          techniques: ["GENERAL"],
        },
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
    expect(completed.ok(), await completed.text()).toBeTruthy()

    const finalizerIdentity = await finalizer.request.get("/api/user")
    expect(finalizerIdentity.ok(), await finalizerIdentity.text()).toBeTruthy()
    const finalizerId = (await finalizerIdentity.json() as { id: string }).id
    const transferred = await hod.request.post(`/api/cases/${id}/transfer`, {
      headers: JSON_HEADERS,
      data: { toUserId: finalizerId },
    })
    expect(transferred.status(), await transferred.text()).toBe(200)
    expect((await transferred.json() as { instant: boolean }).instant).toBe(true)

    // Reassignment removes every ordinary record capability from the creator.
    expect((await creator.request.get(`/api/cases/${id}`)).status()).toBe(404)
    expect((await creator.request.get(`/api/cases/${id}/print-data`)).status()).toBe(404)
    expect((await creator.request.get(`/api/research/cases/${id}`)).status()).toBe(403)

    // The clinician who takes the case over is the one who attests to it.
    const finalized = await finalizer.request.post(`/api/cases/${id}/finalize`, {
      headers: JSON_HEADERS,
    })
    expect(finalized.status(), await finalized.text()).toBe(200)
    await acceptCentralAction(id, "UPSERT")

    // The creator kept nothing. Central discovery does not list the case for
    // them, and the per-case route answers as it would for a case that is not
    // theirs -- there is no read-only view of the delivery state either.
    const creatorDiscovery = await creator.request.get("/api/hospital/central-cases?page=0")
    expect(creatorDiscovery.ok(), await creatorDiscovery.text()).toBeTruthy()
    const creatorList = await creatorDiscovery.json() as { cases: Array<{ caseId: string }> }
    expect(creatorList.cases.map(item => item.caseId)).not.toContain(id)
    expect((await creator.request.get(`/api/hospital/cases/${id}/export-control`)).status()).toBe(404)
    const creatorWithdrawal = await creator.request.put(
      `/api/hospital/cases/${id}/export-control`,
      { headers: JSON_HEADERS, data: { action: "WITHDRAW" } },
    )
    expect(creatorWithdrawal.status(), await creatorWithdrawal.text()).toBe(404)

    const discovery = await finalizer.request.get("/api/hospital/central-cases?page=0")
    expect(discovery.ok(), await discovery.text()).toBeTruthy()
    const bounded = await discovery.json() as {
      cases: Array<{ caseId: string; control: { state: string; canWithdraw: boolean } }>
    }
    const finalizerItem = bounded.cases.find(item => item.caseId === id)
    expect(finalizerItem).toMatchObject({
      caseId: id,
      control: { state: "ACCEPTED", canWithdraw: true },
    })
    expect(JSON.stringify(finalizerItem)).not.toMatch(
      /patient|assignee|caseCode|pseudonym|batchId|reasonNote/i,
    )

    const withdrawn = await finalizer.request.put(
      `/api/hospital/cases/${id}/export-control`,
      { headers: JSON_HEADERS, data: { action: "WITHDRAW" } },
    )
    expect(withdrawn.status(), await withdrawn.text()).toBe(200)
    expect(await withdrawn.json()).toMatchObject({
      state: "WITHDRAWAL_PENDING",
      canWithdraw: false,
      canResend: false,
    })

    await acceptCentralAction(id, "WITHDRAW")
    const resendable = await finalizer.request.get(
      `/api/hospital/cases/${id}/export-control`,
    )
    expect(resendable.ok(), await resendable.text()).toBeTruthy()
    expect(await resendable.json()).toMatchObject({ state: "WITHDRAWN", canResend: true })

    const resent = await finalizer.request.put(
      `/api/hospital/cases/${id}/export-control`,
      { headers: JSON_HEADERS, data: { action: "RESEND" } },
    )
    expect(resent.status(), await resent.text()).toBe(200)
    expect(await resent.json()).toMatchObject({
      state: "WITHDRAWN",
      canWithdraw: false,
      canResend: true,
    })
    await acceptCentralAction(id, "UPSERT")
    const acceptedAgain = await finalizer.request.get(
      `/api/hospital/cases/${id}/export-control`,
    )
    expect(acceptedAgain.ok(), await acceptedAgain.text()).toBeTruthy()
    expect(await acceptedAgain.json()).toMatchObject({
      state: "ACCEPTED",
      canWithdraw: true,
      canResend: false,
    })

    // Neither Central action reopened the record for the creator, and the
    // authority never travelled back to them.
    expect((await creator.request.get(`/api/cases/${id}`)).status()).toBe(404)
    expect((await creator.request.get(`/api/cases/${id}/print-data`)).status()).toBe(404)
    expect((await creator.request.get(`/api/research/cases/${id}`)).status()).toBe(403)
    expect((await creator.request.get(`/api/hospital/cases/${id}/export-control`)).status()).toBe(404)
  })
})
