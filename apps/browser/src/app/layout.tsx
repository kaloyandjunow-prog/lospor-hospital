import type { Metadata } from "next"
import { cookies } from "next/headers"
import { LocaleProvider } from "@/components/locale-provider"
import type { Locale } from "@/lib/i18n"
import "./globals.css"

export const metadata: Metadata = {
  title: "LOSPOR Database",
  description: "Perioperative research, quality improvement, and benchmarking",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies()
  const locale = store.get("lospor_database_locale")?.value === "bg" ? "bg" : "en"
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <LocaleProvider locale={locale as Locale}>{children}</LocaleProvider>
      </body>
    </html>
  )
}
