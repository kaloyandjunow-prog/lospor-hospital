/**
 * Account actions a signed-in user can take from the settings menu.
 *
 * Requests and browser plumbing, kept out of the menu component so the menu is
 * markup and state rather than fetch handling, and so these are testable.
 */

/**
 * Fetch the signed-in user's personal data export and hand it to the browser.
 *
 * Lifted out of `SettingsMenu` because none of it is a settings menu: it is a
 * request, a filename negotiation and the anchor-click dance browsers require
 * to save a blob. The component keeps the part that is its own — the spinner
 * and the error line — and this keeps the part that is testable.
 *
 * Throws on failure, with the server's message when it sent one, so the caller
 * decides how to show it rather than this deciding for every caller.
 */
export async function downloadPersonalExport(
  fallbackErrorMessage: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl("/api/user/export", { cache: "no-store" })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || fallbackErrorMessage)
  }

  // The server names the file; the header is the only place it does. A missing
  // or malformed disposition falls back to a name rather than to `undefined`,
  // which browsers save as "download" with no extension.
  const disposition = response.headers.get("content-disposition") ?? ""
  const filename = disposition.match(/filename="?([^"]+)"?/i)?.[1] ?? "lospor-export.zip"

  const url = URL.createObjectURL(await response.blob())
  try {
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // Released even if the click throws: an object URL holds the whole blob in
    // memory until it is revoked, and an export is not small.
    URL.revokeObjectURL(url)
  }
}

/**
 * Ask to be granted a role, and return what the server now holds.
 *
 * Here rather than in `SettingsMenu` for the same reason as the export above:
 * a request and a tolerant parse are not settings-menu concerns. Null means
 * the server answered with nothing usable, which the caller treats as "no
 * change" rather than as an error — a role request that quietly did nothing is
 * better than a menu that throws at somebody who pressed a button.
 */
export async function requestRole<T>(fetchImpl: typeof fetch = fetch): Promise<T | null> {
  try {
    const response = await fetchImpl("/api/role-request", { method: "POST" })
    const text = await response.text()
    const data = text ? JSON.parse(text) as T : null
    return response.ok ? data : null
  } catch {
    return null
  }
}
