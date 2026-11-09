import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { SYNTHETIC_MONTH, sofiaIso } from "./synthetic-day"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhoneIntraop } from "./pwa"

// The side of a block and the unilateral spinal (10.2.0), in both apps and the API: a side saved beside the technique
// list and read back, pruned when its technique goes, and the phone's Technique tab finding a block by search and
// saving its side.

test.describe.configure({ timeout: 600_000 })
test.use({ actionTimeout: 15_000 })

const PREOP = {
  ageYears: 44, sex: "MALE" as const, heightCm: 180, weightKg: 82, clinicalMode: "ADULT",
  diagnoses: [{ label: "Gonarthrosis" }], procedures: [{ label: "Total knee arthroplasty" }],
  bpSystolic: 132, bpDiastolic: 78, heartRate: 72, respiratoryRate: 14, mallampati: "II" as const, asaScore: "II" as const,
}
const STARTED_AT = sofiaIso(8, 55) // 08:55 in Europe/Sofia, yesterday

type IntraopBody = { intraop?: { techniques?: string[]; techniqueSides?: Record<string, string>; syncRevision?: number } }

async function newCase(context: BrowserContext, intraop: Record<string, unknown>): Promise<string> {
  const created = await context.request.post("/api/cases", {
    headers: JSON_HEADERS,
    data: { preop: PREOP, intraop: { monthYear: SYNTHETIC_MONTH, startTime: "08:55", startedAt: STARTED_AT, timezone: "Europe/Sofia", nbpMonitor: true, ecg: true, spO2Monitor: true, ...intraop } },
  })
  expect(created.ok(), await created.text()).toBe(true)
  return (await created.json() as { id: string }).id
}

async function intraopOf(request: APIRequestContext, caseId: string): Promise<NonNullable<IntraopBody["intraop"]>> {
  const response = await request.get(`/api/cases/${caseId}`)
  expect(response.status(), await response.text()).toBe(200)
  return ((await response.json()) as IntraopBody).intraop ?? {}
}

test("a side is saved beside the technique list, read back, and dropped with its technique", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  try {
    const caseId = await newCase(web, { techniques: ["GENERAL_BALANCED", "BLOCK_ADDUCTOR", "SPINAL_UNILATERAL"], techniqueSides: { BLOCK_ADDUCTOR: "LEFT", SPINAL_UNILATERAL: "RIGHT", GENERAL_BALANCED: "LEFT" } })
    const saved = await intraopOf(web.request, caseId)
    // A technique with no side does not keep one.
    expect(saved.techniqueSides).toEqual({ BLOCK_ADDUCTOR: "LEFT", SPINAL_UNILATERAL: "RIGHT" })
    expect(saved.techniques).toEqual(expect.arrayContaining(["GENERAL_BALANCED", "BLOCK_ADDUCTOR", "SPINAL_UNILATERAL"]))

    const revision = saved.syncRevision
    const patched = await web.request.patch(`/api/cases/${caseId}`, {
      headers: { ...JSON_HEADERS, ...(revision != null ? { "x-lospor-intraop-revision": String(revision) } : {}) },
      data: { intraop: { techniques: ["GENERAL_BALANCED", "SPINAL_UNILATERAL"], techniqueSides: { BLOCK_ADDUCTOR: "LEFT", SPINAL_UNILATERAL: "RIGHT" } } },
    })
    expect(patched.ok(), await patched.text()).toBe(true)
    expect((await intraopOf(web.request, caseId)).techniqueSides).toEqual({ SPINAL_UNILATERAL: "RIGHT" })
  } finally {
    await web.close().catch(() => {})
  }
})

test("the phone finds a block by search and saves its side", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const caseId = await newCase(web, { techniques: ["GENERAL_BALANCED"] })
  const { context, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
  try {
    await openPhoneIntraop(phone, caseId)
    // The tab carries a required marker, so its text is "Technique *".
    await phone.getByText(/^Technique(\s*\*)?$/).first().click()
    await expect(phone.getByTestId("technique-smart")).toBeVisible({ timeout: 30_000 })
    await phone.getByTestId("technique-search").fill("adductor")
    await phone.getByTestId("technique-hit-BLOCK_ADDUCTOR").click()
    await expect(phone.getByTestId("technique-chip-BLOCK_ADDUCTOR")).toBeVisible()
    await phone.getByTestId("technique-side-BLOCK_ADDUCTOR-LEFT").click()

    await expect.poll(async () => (await intraopOf(web.request, caseId)).techniqueSides, { timeout: 60_000 }).toEqual({ BLOCK_ADDUCTOR: "LEFT" })
    expect((await intraopOf(web.request, caseId)).techniques).toEqual(expect.arrayContaining(["GENERAL_BALANCED", "BLOCK_ADDUCTOR"]))
  } finally {
    await context.close().catch(() => {})
    await web.close().catch(() => {})
  }
})
