import type { Metadata } from "next"
import { LocaleProvider } from "@/components/locale-provider"
import { currentSession } from "@/lib/api"
import { currentLocale } from "@/lib/server-locale"
import "./globals.css"

export const metadata: Metadata = {
  title: "LOSPOR Database",
  description: "Perioperative research, quality improvement, and benchmarking",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, session] = await Promise.all([currentLocale(), currentSession()])
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <LocaleProvider initialLocale={locale} authenticated={Boolean(session?.user)}>{children}</LocaleProvider>
      </body>
    </html>
  )
}
