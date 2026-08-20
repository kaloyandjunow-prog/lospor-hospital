import { test, expect, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone, openPhonePreop } from "./pwa"

// One clinician, one case, both apps.
//
// A pre-assessment gets started on whatever is to hand — the ward computer, a
// phone in the corridor — and finished somewhere else. Each app has had its own
// suite for a while and neither has ever run against the other, so "I typed it
// on the computer and it was not on my phone" has had no test that could catch
// it.
//
// Two things are asserted throughout, and the second is the one that matters:
//
//  1. the value is on screen in the other app, and
//  2. the save actually left the browser.
//
// A field can look right in the app that typed it while nothing has been sent
// anywhere, so every test here checks the request as well as the pixels. That is
// the failure this suite exists for.

const PREOP = {
  ageYears: 44, sex: "MALE" as const, heightCm: 180, weightKg: 82,
  diagnoses: [{ label: "Cholelithiasis" }],
  procedures: [{ label: "Laparoscopic cholecystectomy" }],
}

// The same placeholder in both apps, which is what lets one field be typed on
// either side. Anything keyed off a wheel picker or a stepper would be testing
// the control rather than the sync.
const TEAM_NOTES = "Roles, theatre number, any reminders — do not include names"
const PHYSICAL_EXAM_WEB = "No patient-identifying information — general appearance, relevant physical findings…"
const PHYSICAL_EXAM_PHONE = "General appearance, relevant exam findings..."

/** Records every save the page sends, so a test can prove one happened. */
function watchSaves(page: Page, caseId: string): string[] {
  const saves: string[] = []
  page.on("request", request => {
    const method = request.method()
    if (method !== "PATCH" && method !== "PUT" && method !== "POST") return
    if (!request.url().includes(caseId)) return
    saves.push(`${method} ${new URL(request.url()).pathname}`)
  })
  return saves
}

const savesFor = (saves: string[]) => saves.filter(s => s.startsWith("PATCH"))

/** What the server holds, asked as a third party rather than as either app. */
async function serverPreop(
  ctx: { request: { get: (u: string) => Promise<{ json: () => Promise<unknown> }> } },
  id: string,
): Promise<Record<string, unknown>> {
  const record = await (await ctx.request.get(`/api/cases/${id}`)).json() as
    { preop?: Record<string, unknown> }
  return record.preop ?? {}
}

test.describe("a preoperative assessment carried between the two apps", () => {
  test("a section finished on the web app is there on the phone", async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    const { id } = await (await web.request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })).json() as { id: string }

    const page = await web.newPage()
    await page.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))
    const saves = watchSaves(page, id)

    try {
      await page.goto(`/cases/new?continue=${id}`)
      await page.waitForLoadState("networkidle")

      // Two different sections, so this is a section-to-section carry rather
      // than one field happening to sync.
      await page.locator('textarea[name="teamNotes"]').fill("Theatre 4, list starts 08:30")
      await page.getByPlaceholder(PHYSICAL_EXAM_WEB).fill("Chest clear, no murmurs")
      await page.locator('textarea[name="teamNotes"]').blur()

      await expect.poll(() => savesFor(saves).length, {
        message: "the web app never sent the assessment anywhere",
      }).toBeGreaterThan(0)

      // The server, not the page that typed it.
      await expect.poll(async () => (await serverPreop(web, id)).teamNotes)
        .toBe("Theatre 4, list starts 08:30")

      const { context: phoneCtx, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
      try {
        await openPhonePreop(phone, id)

        // The demographics the web app already held, summarised on the phone's
        // section list.
        await expect(phone.getByText("44", { exact: false }).first()).toBeVisible()
        await expect(phone.getByText(/Laparoscopic cholecystectomy/i).first()).toBeVisible()

        // And the two sections just filled in on the web.
        await expect(phone.getByPlaceholder(TEAM_NOTES))
          .toHaveValue("Theatre 4, list starts 08:30")
        await expect(phone.getByPlaceholder(PHYSICAL_EXAM_PHONE))
          .toHaveValue("Chest clear, no murmurs")
      } finally {
        await phoneCtx.close()
      }
    } finally {
      await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })

  test("a half-filled section is already saved before the clinician moves on", async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    const { id } = await (await web.request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })).json() as { id: string }

    const page = await web.newPage()
    await page.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))
    const saves = watchSaves(page, id)

    try {
      await page.goto(`/cases/new?continue=${id}`)
      await page.waitForLoadState("networkidle")

      // Typed and then left alone — no blur, no moving to another section, no
      // submit. This is the phone-rings-mid-sentence case, and the one where a
      // value living only in component state would be lost.
      const notes = page.locator('textarea[name="teamNotes"]')
      await notes.click()
      await notes.type("Interrupted mid-", { delay: 30 })

      await expect.poll(() => savesFor(saves).length, {
        timeout: 20_000,
        message: "nothing was saved while the field still had focus",
      }).toBeGreaterThan(0)

      await expect.poll(async () => (await serverPreop(web, id)).teamNotes, { timeout: 20_000 })
        .toBe("Interrupted mid-")

      // Still focused: the save happened underneath the clinician rather than
      // because they finished.
      expect(await notes.evaluate(el => el === document.activeElement)).toBe(true)

      const { context: phoneCtx, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
      try {
        await openPhonePreop(phone, id)
        await expect(phone.getByPlaceholder(TEAM_NOTES)).toHaveValue("Interrupted mid-")
      } finally {
        await phoneCtx.close()
      }
    } finally {
      await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })

  test("what the phone records reaches the web app", async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    const { id } = await (await web.request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })).json() as { id: string }

    const { context: phoneCtx, page: phone } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
    const phoneSaves = watchSaves(phone, id)

    try {
      await openPhonePreop(phone, id)

      // Typed key by key rather than `fill()`. The phone app is React Native
      // Web and its autosave hangs off react-hook-form's `useWatch`; setting
      // the value straight onto the element updates what is on screen without
      // the form ever hearing about it, so nothing is scheduled and nothing is
      // sent. That failure looks exactly like broken sync.
      const notes = phone.getByPlaceholder(TEAM_NOTES)
      await notes.click()
      await notes.pressSequentially("Consented on the ward", { delay: 25 })

      await expect.poll(() => savesFor(phoneSaves).length, {
        timeout: 20_000,
        message: "the phone app never sent the assessment anywhere",
      }).toBeGreaterThan(0)

      await expect.poll(async () => (await serverPreop(web, id)).teamNotes, { timeout: 20_000 })
        .toBe("Consented on the ward")

      // Opened fresh, so this is the server's copy and not anything the phone
      // left behind in this browser.
      const page = await web.newPage()
      await page.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))
      await page.goto(`/cases/new?continue=${id}`)
      await page.waitForLoadState("networkidle")
      await expect(page.locator('textarea[name="teamNotes"]')).toHaveValue("Consented on the ward")
    } finally {
      await phoneCtx.close()
      await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })

  test("a reload shows what the server holds, not what the tab remembered", async ({ browser }) => {
    const web = await contextFor(browser, "member-a")
    const { id } = await (await web.request.post("/api/cases", {
      headers: JSON_HEADERS, data: { preop: PREOP },
    })).json() as { id: string }

    const page = await web.newPage()
    await page.addInitScript(() => window.localStorage.setItem("tourCompleted", "1"))

    try {
      await page.goto(`/cases/new?continue=${id}`)
      await page.waitForLoadState("networkidle")
      await page.locator('textarea[name="teamNotes"]').fill("Survives a reload")
      await page.locator('textarea[name="teamNotes"]').blur()

      await expect.poll(async () => (await serverPreop(web, id)).teamNotes, { timeout: 20_000 })
        .toBe("Survives a reload")

      // The check that a value rendered from local state cannot pass.
      await page.reload()
      await page.waitForLoadState("networkidle")
      await expect(page.locator('textarea[name="teamNotes"]')).toHaveValue("Survives a reload")
    } finally {
      await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS }).catch(() => {})
    }
  })
})
