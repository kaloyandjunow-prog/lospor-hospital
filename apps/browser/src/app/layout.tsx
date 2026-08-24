import type { Metadata } from "next"
import { LocaleProvider } from "@/components/locale-provider"
import { currentSession } from "@/lib/api"
import { metadataForLocale } from "@/lib/i18n"
import { currentLocale } from "@/lib/server-locale"
import "./globals.css"

export async function generateMetadata(): Promise<Metadata> {
  return metadataForLocale(await currentLocale())
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, session] = await Promise.all([
    currentLocale(),
    currentSession(),
  ])
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <LocaleProvider initialLocale={locale} authenticated={Boolean(session?.user)}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  )
}
