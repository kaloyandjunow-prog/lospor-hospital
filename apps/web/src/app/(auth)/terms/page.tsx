import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import { LegalDocument } from "@/components/legal/LegalDocument"
import { parseLocale, DEFAULT_LOCALE } from "@/i18n/locales"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms")
  return { title: `${t("title")} — LOSPOR` }
}

export default async function TermsPage() {
  const locale = parseLocale(await getLocale()) ?? DEFAULT_LOCALE
  return <LegalDocument kind="TERMS" locale={locale} />
}
