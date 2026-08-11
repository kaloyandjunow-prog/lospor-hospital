import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { cookies } from "next/headers"

// --font-sans and --font-geist-mono are declared in globals.css, alongside the
// @font-face rules that load them from /public/fonts. See the note there for
// why they are not fetched from Google at build time.

export const viewport: Viewport = {
  themeColor: "#090b0c",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: "LOSPOR — Large Open Source Perioperative Register",
  description: "Perioperative anaesthesia data collection and research platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "LOSPOR",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#090b0c",
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale    = await getLocale()
  const messages  = await getMessages()
  const jar       = await cookies()
  const themeCookie = jar.get("theme")?.value
  const isDark      = themeCookie !== "light" // default to dark when no cookie set

  return (
    <html lang={locale} className={`h-full antialiased${isDark ? " dark" : ""}`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster richColors position="top-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
