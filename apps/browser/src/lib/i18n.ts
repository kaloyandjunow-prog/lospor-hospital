import { translations, type Locale } from "./translations"

export { translations as messages }
export type { Locale, TranslationKey } from "./translations"

export function metadataForLocale(locale: Locale) {
  return {
    title: translations[locale].brand,
    description: translations[locale].loginSummary,
  }
}
