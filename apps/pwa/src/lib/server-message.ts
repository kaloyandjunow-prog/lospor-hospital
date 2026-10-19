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
