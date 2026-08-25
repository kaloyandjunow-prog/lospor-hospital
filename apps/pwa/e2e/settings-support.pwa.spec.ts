import { expect, test } from "@playwright/test"

test("profile correction, local help, support preview, and reminder limits are reachable", async ({ page }) => {
  let correction: Record<string, unknown> | null = null
  const user = {
    id: "support-e2e-user",
    email: "clinician@hospital.example",
    name: "Dr E2E Clinician",
    firstName: "E2E",
    lastName: "Clinician",
    title: "Dr",
    role: "MEMBER",
    institution: { id: "e2e", name: "E2E Test Hospital", city: "Sofia" },
    preferences: { ui: { locale: "en" } },
  }
  await page.route("**/v1/**", async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === "/v1/auth/session" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) })
      return
    }
    if (path === "/v1/user" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
      return
    }
    if (path === "/v1/user" && request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>
      if ("firstName" in body || "lastName" in body || "title" in body) correction = body
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...user,
          ...(correction ? correction : {}),
          name: correction ? "Prof E2E Clinician" : user.name,
        }),
      })
      return
    }
    if (path === "/v1/capabilities") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          support: { configured: true, contactUrl: "mailto:support@hospital.example" },
          features: {},
        }),
      })
      return
    }
    if (path === "/v1/locale") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locale: "en" }) })
      return
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  })

  await page.goto("/")
  await expect(page.getByText("New case", { exact: true })).toBeVisible()
  await page.goto("/settings")
  await page.getByText("UI, Automation, Privacy & Data", { exact: true }).click()
  await expect(page.getByText(
    "PWA reminders are foreground-only. They stop when the app or active case screen is closed.",
    { exact: false },
  )).toBeVisible()

  await page.goto("/settings")
  await page.getByText("View profile", { exact: true }).click()
  await expect(page.getByText("Profile correction", { exact: true })).toBeVisible()
  await page.getByLabel("Professional title").fill("Prof")
  await page.getByLabel("First name").fill("E2E")
  await page.getByLabel("Last name").fill("Clinician")
  await page.getByRole("button", { name: "Save profile" }).click()
  await expect(page.getByText("Profile saved", { exact: true })).toBeVisible()
  expect(correction).toEqual({ firstName: "E2E", lastName: "Clinician", title: "Prof" })

  await page.goto("/settings")
  await page.getByText("UI, Automation, Privacy & Data", { exact: true }).click()
  await page.getByText("Help and documentation", { exact: true }).click()
  await expect(page.getByText(/included with LOSPOR .*without internet access/)).toBeVisible()
  await expect(page.getByText("Optional public documentation", { exact: true })).toBeVisible()
  await expect(page.getByText("This installation has a configured support destination.", { exact: true })).toBeVisible()

  await page.goto("/settings")
  await page.getByText("UI, Automation, Privacy & Data", { exact: true }).click()
  await page.getByText("Report a bug", { exact: true }).click()
  await expect(page.getByText("Diagnostic preview", { exact: true })).toBeVisible()
  await expect(page.getByText(/No patient, case, clinical, account, institution, token, or free-text content is included/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Copy diagnostic report" })).toBeEnabled()
  await expect(page.getByRole("link", { name: "Open support contact" })).toBeEnabled()
})
