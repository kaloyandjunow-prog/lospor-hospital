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
