import { localizeServerMessage } from "@lospor/core/server-messages"

/**
 * A message from the server (or a fallback for one) in the page's language.
 * Reads the language from `<html lang>`, which the root layout sets from the
 * account's locale, so it also works outside components.
 */
export function serverMessage(message: string): string {
  const language = typeof document === "undefined" ? "en" : document.documentElement.lang
  return localizeServerMessage(message, language)
}

/**
 * Why the server refused, in the page's language: the `error` it sent (translated when we know it), or null when it sent
 * none (a dropped connection, an HTML error page). A refusal is shown with its reason, never as a bare "failed" (2026-11-23).
 */
export async function refusalReason(response: Response): Promise<string | null> {
  try {
    const body = await response.clone().json() as { error?: unknown }
    return typeof body.error === "string" && body.error ? serverMessage(body.error) : null
  } catch {
    return null
  }
}
