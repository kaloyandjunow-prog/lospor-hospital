import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { LosporBrand } from "@/components/LosporBrand"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { legalDocumentDescriptor, type LegalKind } from "@/lib/legal-documents"
import type { AppLocale } from "@/i18n/locales"

type LegalSection = {
  title: string
  paragraphs?: string[]
  warning?: string
  bullets?: Array<{ label?: string; text: string }>
}

export async function LegalDocument({
  kind,
  locale,
}: {
  kind: LegalKind
  locale: AppLocale
}) {
  const namespace = kind === "TERMS" ? "legal.terms" : "legal.privacy"
  const documentT = await getTranslations(namespace)
  const meta = await getTranslations("legal.meta")
  const descriptor = legalDocumentDescriptor(kind, locale)
  const sections = documentT.raw("sections") as LegalSection[]
  const effectiveDate = new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${descriptor.effectiveDate}T00:00:00Z`))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 dark:from-[#111] dark:to-[#1a1a2e] p-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <LosporBrand compact linked />
          <LanguageSwitcher currentLocale={locale} prominent />
        </div>

        <Card>
          <CardHeader>
            <h1 className="font-heading text-base font-medium leading-snug">
              {documentT("title")}
            </h1>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-[max-content_1fr] dark:text-slate-400">
              <dt>{meta("effectiveDate")}</dt><dd>{effectiveDate}</dd>
              <dt>{meta("version")}</dt><dd>{descriptor.version}</dd>
              <dt>{meta("deployment")}</dt><dd>{meta("cloudDemo")}</dd>
              <dt>{meta("contentHash")}</dt><dd className="break-all font-mono">{descriptor.contentSha256}</dd>
            </dl>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-5 text-sm leading-relaxed">
            {sections.map(section => (
              <section key={section.title}>
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{section.title}</h2>
                {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                {section.warning && (
                  <p className="text-amber-700 dark:text-amber-400 text-xs font-medium">{section.warning}</p>
                )}
                {section.bullets && (
                  <ul className="list-disc pl-4 space-y-1">
                    {section.bullets.map(item => (
                      <li key={`${item.label ?? ""}:${item.text}`}>
                        {item.label && <><strong>{item.label}:</strong>{" "}</>}
                        {item.text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <Link href={kind === "TERMS" ? "/privacy" : "/terms"} className="hover:underline">
            {kind === "TERMS" ? meta("privacyLink") : meta("termsLink")}
          </Link>
          {" · "}
          <Link href="/login" className="hover:underline">{meta("backToLogin")}</Link>
        </p>
      </div>
    </div>
  )
}
