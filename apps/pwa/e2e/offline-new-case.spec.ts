import { expect, test } from "@playwright/test"
import { ACCOUNTS, signInAs } from "./session"

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

test("an offline new case survives navigation and syncs after reconnection", async ({ page, context, request }) => {
  // Signed in by injecting the session rather than by driving the login
  // screen. Bulgarian is now the login default, so a spec that types into the
  // login form has to pick a language before any English label exists — and
  // this spec is not about the login screen, which sign-in.pwa.spec.ts covers.
  // signInAs also pins the account locale to English, which is what every
  // label asserted below is written in.
  await signInAs(page, request, ACCOUNTS.admin)
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
