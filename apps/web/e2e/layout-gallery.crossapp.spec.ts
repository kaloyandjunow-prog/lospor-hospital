import path from "path"
import { test, expect, type Page } from "@playwright/test"
import { contextFor, JSON_HEADERS } from "./roles"
import { E2E_MEMBER_A_EMAIL } from "./credentials"
import { openPhone } from "./pwa"

// A gallery of every case-screen layout, in both themes, for a person to look
// at (10.0.0). Not a test of behaviour: it only runs with LAYOUT_SHOTS_DIR set.

const DIR = process.env.LAYOUT_SHOTS_DIR
test.skip(!DIR, "LAYOUT_SHOTS_DIR not set")
test.describe.configure({ timeout: 600_000 })

const PREOP = {
  ageYears: 63, sex: "MALE" as const, heightCm: 176, weightKg: 88,
  allergies: true, allergyDetails: [{ label: "Penicillin" }],
  diagnoses: [{ label: "Cholelithiasis" }], procedures: [{ label: "Laparoscopic cholecystectomy" }],
  bpSystolic: 148, bpDiastolic: 86, heartRate: 74, respiratoryRate: 14, spO2: 97,
  mallampati: "II" as const, asaScore: "II" as const,
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(DIR!, `${name}.png`) })
}

test("web: every step in every layout, both themes", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const created = await web.request.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()
  await web.request.patch(`/api/cases/${id}`, { headers: JSON_HEADERS, data: { postop: { recoveryBpSystolic: 120, recoverySpO2: 95 } } })
  try {
    for (const theme of ["dark", "light"] as const) {
      for (const layout of ["sidebar", "tabs", "scroll"] as const) {
        for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "narrow", width: 390, height: 844 }]) {
          if (viewport.name === "narrow" && layout !== "sidebar") continue
          const page = await web.newPage()
          await page.setViewportSize(viewport)
          await page.addInitScript(({ theme, layout }) => {
            localStorage.setItem("theme", theme)
            localStorage.setItem("tourCompleted", "1")
            localStorage.setItem("caseSidebar", layout === "sidebar" ? "on" : "off")
            if (layout !== "sidebar") for (const key of ["preopLayout", "layoutMode", "postopLayout"]) localStorage.setItem(key, layout)
          }, { theme, layout })
          await page.context().addCookies([{ name: "theme", value: theme, url: page.url().startsWith("http") ? page.url() : "http://localhost:3000" }])
          for (const [step, label] of [[0, "preop"], [1, "intraop"], [2, "postop"]] as const) {
            await page.goto(`/cases/new?continue=${id}&step=${step}`)
            await page.waitForLoadState("networkidle").catch(() => {})
            await shot(page, `web-${theme}-${layout}-${viewport.name}-${label}`)
          }
          await page.close()
        }
      }
    }
  } finally {
    await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await web.close()
  }
})

test("phone: preop and postop sectioned and scrolling, intraop, both themes", async ({ browser }) => {
  const web = await contextFor(browser, "member-a")
  const created = await web.request.post("/api/cases", { headers: JSON_HEADERS, data: { preop: PREOP } })
  expect(created.status(), await created.text()).toBe(201)
  const { id } = await created.json()
  try {
    for (const theme of ["dark", "light"] as const) {
      for (const layout of ["sections", "scroll"] as const) {
        const { context, page } = await openPhone(browser, E2E_MEMBER_A_EMAIL)
        await page.addInitScript(({ theme, layout, scale }) => {
          if (scale) localStorage.setItem("lospor_ss_lospor_ui_scale", scale)
          localStorage.setItem("lospor_ss_lospor_theme", theme)
          localStorage.setItem("lospor_ss_lospor_preop_layout", layout)
          localStorage.setItem("lospor_ss_lospor_postop_layout", layout)
        }, { theme, layout, scale: process.env.E2E_UI_SCALE ?? "" })
        await page.goto(`/cases/new?continue=${id}`)
        await page.getByText("Preoperative assessment").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {})
        await shot(page, `phone-${theme}-${layout}-preop`)
        await page.getByText("Physical Exam", { exact: true }).first().click().catch(() => {})
        await shot(page, `phone-${theme}-${layout}-preop-exam`)
        await page.goto(`/cases/postop/${id}`)
        await page.getByTestId("postop-pill-score").waitFor({ state: "visible", timeout: 60_000 }).catch(() => {})
        await shot(page, `phone-${theme}-${layout}-postop`)
        if (layout === "sections") {
          await page.getByTestId("postop-pill-pain").click().catch(() => {})
          await shot(page, `phone-${theme}-${layout}-postop-pain`)
          await page.goto(`/cases/intraop/${id}`)
          await page.waitForTimeout(4000)
          await shot(page, `phone-${theme}-intraop`)
        }
        await context.close()
      }
    }
  } finally {
    await web.request.delete(`/api/cases/${id}`, { headers: JSON_HEADERS })
    await web.close()
  }
})
