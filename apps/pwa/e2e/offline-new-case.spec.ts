import { expect, test } from "@playwright/test"

const email = process.env.E2E_EMAIL ?? "e2e@lospor.test"
const password = process.env.E2E_PASSWORD ?? "E2e-Test-Pass!234"

async function draftCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("lospor")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const transaction = request.result.transaction("case-drafts", "readonly")
      const countRequest = transaction.objectStore("case-drafts").count()
      countRequest.onsuccess = () => resolve(countRequest.result)
      countRequest.onerror = () => reject(countRequest.error)
    }
  }))
}

async function clearDrafts(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lospor")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const stores = ["case-drafts", "patient-references", "patient-reference-keys"]
        .filter(name => request.result.objectStoreNames.contains(name))
      if (stores.length === 0) { resolve(); return }
      const transaction = request.result.transaction(stores, "readwrite")
      for (const store of stores) transaction.objectStore(store).clear()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    }
  }))
}

async function inspectStoredDraft(page: import("@playwright/test").Page) {
  return page.evaluate(() => new Promise<{ draft: unknown; reference: unknown }>((resolve, reject) => {
    const request = indexedDB.open("lospor")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const transaction = request.result.transaction(["case-drafts", "patient-references"], "readonly")
      const draftRequest = transaction.objectStore("case-drafts").getAll()
      const referenceRequest = transaction.objectStore("patient-references").getAll()
      transaction.oncomplete = () => resolve({
        draft: draftRequest.result[0],
        reference: referenceRequest.result[0],
      })
      transaction.onerror = () => reject(transaction.error)
    }
  }))
}

test("an offline new case survives navigation and syncs after reconnection", async ({ page, context }) => {
  await page.goto("/")
  await page.getByPlaceholder("you@hospital.org").fill(email)
  await page.locator("input[type=password]").fill(password)
  await page.getByText("Sign in", { exact: true }).click()
  await expect(page.getByText("New case", { exact: true })).toBeVisible()
  await clearDrafts(page)

  await page.getByText("New case", { exact: true }).click()
  await page.getByText("Demographics", { exact: true }).click()
  await expect(page.getByText(/^Age \(years\)/)).toBeVisible()
  await context.setOffline(true)
  const patientNumber = `OFFLINE-E2E-${Date.now()}`
  await page.locator("input").first().fill(patientNumber)
  await page.getByText("Female", { exact: true }).click()
  await expect(page.getByText(/Saved locally/)).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => draftCount(page)).toBe(1)
  const stored = await inspectStoredDraft(page)
  expect(JSON.stringify(stored.draft)).not.toContain(patientNumber)
  expect(JSON.stringify(stored.draft)).not.toContain("patientNumber")
  expect(JSON.stringify(stored.reference)).not.toContain(patientNumber)

  await page.getByRole("button", { name: "Dashboard" }).click()
  await expect(page.getByText("Unsynced local draft", { exact: true })).toBeVisible()
  await expect.poll(() => draftCount(page)).toBe(1)

  await context.setOffline(false)
  await page.reload()
  await expect(page.getByText("New case", { exact: true })).toBeVisible()
  await expect.poll(() => draftCount(page), { timeout: 30_000 }).toBe(0)
})
