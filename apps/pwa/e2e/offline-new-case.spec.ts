import { expect, test } from "@playwright/test"

const email = process.env.E2E_EMAIL ?? "e2e@lospor.test"
const password = process.env.E2E_PASSWORD ?? "E2e-Test-Pass!234"

async function draftCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("lospor", 1)
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
    const request = indexedDB.open("lospor", 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("case-drafts")) {
        request.result.createObjectStore("case-drafts", { keyPath: "localId" })
      }
    }
    request.onsuccess = () => {
      const transaction = request.result.transaction("case-drafts", "readwrite")
      transaction.objectStore("case-drafts").clear()
      transaction.oncomplete = () => resolve()
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
  await page.getByText("Female", { exact: true }).click()
  await expect(page.getByText(/Saved locally/)).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => draftCount(page)).toBe(1)

  await page.getByRole("button", { name: "Dashboard" }).click()
  await expect(page.getByText("Unsynced local draft", { exact: true })).toBeVisible()
  await expect.poll(() => draftCount(page)).toBe(1)

  await context.setOffline(false)
  await page.reload()
  await expect(page.getByText("New case", { exact: true })).toBeVisible()
  await expect.poll(() => draftCount(page), { timeout: 30_000 }).toBe(0)
})
