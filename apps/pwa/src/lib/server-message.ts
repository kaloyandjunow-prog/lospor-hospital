import { localizeServerMessage } from "@lospor/core/server-messages"

/**
 * The app's language, for messages made outside React (API errors, autosave).
 * The preferences provider keeps it current.
 */
let currentLanguage = "en"

export function setServerMessageLanguage(language: string) {
  currentLanguage = language
}

/** A message from the server (or a fallback for one) in the app's language. */
export function serverMessage(message: string): string {
  return localizeServerMessage(message, currentLanguage)
}

/**
 * Why the server refused, in the app's language: the `error` it sent, translated when we know it, or null when it sent
 * none. A refusal is shown with its reason, never as a bare "failed" (2026-11-23).
 */
export async function refusalReason(response: Response): Promise<string | null> {
  try {
    const body = await response.clone().json() as { error?: unknown }
    return typeof body.error === "string" && body.error ? serverMessage(body.error) : null
  } catch {
    return null
  }
}
