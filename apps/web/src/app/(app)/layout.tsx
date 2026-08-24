import { getLiveSessionResult } from "@/lib/live-session"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LayoutDashboard, FilePlus, Shield, SlidersHorizontal } from "lucide-react"
import { SignOutButton } from "@/components/SignOutButton"
import { getTranslations, getLocale } from "next-intl/server"
import { SettingsMenu } from "@/components/SettingsMenu"
import { OngoingCasesButton } from "@/components/OngoingCasesButton"
import { TourManager } from "@/components/TourManager"
import { TourButton } from "@/components/TourButton"
import { OnboardingGate } from "@/components/OnboardingGate"
import { OfflineLibraryBanner } from "@/components/OfflineLibraryBanner"
import { OutboxBadge } from "@/components/OutboxBadge"
import { AccountLocaleSync } from "@/components/AccountLocaleSync"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessionResult = await getLiveSessionResult()
  const session = sessionResult.session
  if (!session?.user?.id) {
    const params = sessionResult.errorCode === "CLINICAL_APP_FORBIDDEN"
      ? `?${new URLSearchParams({ error: sessionResult.errorCode }).toString()}`
      : ""
    redirect(`/login${params}`)
  }

  const needsOnboarding = !session.user.acceptedTermsAt

  const t      = await getTranslations()
  const locale = await getLocale()

  return (
    <TourManager>
    <AccountLocaleSync
      accountLocale={session.user.preferences?.ui?.locale ?? session.user.preferredLocale}
      currentLocale={locale}
    />
    <div className="min-h-screen flex flex-col bg-[#f0f0ef] dark:bg-[#111111]">
      <header className="no-print bg-white dark:bg-[#1c1c1c] border-b border-slate-200 dark:border-[#2e2e2e] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center gap-2">
          <Link href="/dashboard" className="flex shrink-0 items-center" aria-label={t("nav.dashboardAria")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/lospor-horizontal-light.svg" alt="LOSPOR" className="h-16 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/lospor-horizontal-dark.svg" alt="LOSPOR" className="hidden h-16 w-auto dark:block" />
          </Link>

          <nav className="hidden md:flex flex-1 items-center justify-center gap-1">
            <Link href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-100 dark:active:bg-[#2a2a2a] transition-colors">
              <LayoutDashboard className="h-4 w-4" />
              {t("nav.dashboard")}
            </Link>
            <span data-tour="nav-ongoing"><OngoingCasesButton /></span>
            {session.user.role === "ADMIN" && (
              <Link href="/admin"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:bg-blue-50 dark:active:bg-blue-900/20 transition-colors">
                <Shield className="h-4 w-4" />
                {t("nav.admin")}
              </Link>
            )}
            {(session.user.role === "ADMIN" || session.user.role === "HEAD_OF_DEPT") && (
              <Link href="/clinical-rules"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-100 dark:active:bg-[#2a2a2a] transition-colors">
                <SlidersHorizontal className="h-4 w-4" />
                {t("nav.clinicalRules")}
              </Link>
            )}
            <Link href="/cases/new" data-tour="nav-new-case"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-100 dark:active:bg-[#2a2a2a] transition-colors">
              <FilePlus className="h-4 w-4" />
              {t("nav.newCase")}
            </Link>
          </nav>

          <div className="flex items-center gap-3 md:ml-0 ml-auto">
            <OutboxBadge />
            <TourButton />
            <span data-tour="settings-menu">
              <SettingsMenu userName={session.user?.name} institutionId={session.user?.institutionId} institutionName={session.user?.institutionName} currentLocale={locale} role={session.user.role} lastLoginAt={session.user.lastLoginAt} />
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <OfflineLibraryBanner />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <OnboardingGate needsOnboarding={needsOnboarding}>
          {children}
        </OnboardingGate>
      </main>

      <footer className="no-print border-t border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] py-4 text-center text-xs text-slate-400 dark:text-slate-500">
        {t("common.gdprFooter")}
        {" · "}
        <Link href="/terms" className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">{t("nav.footerTerms")}</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">{t("nav.footerPrivacy")}</Link>
        {" · "}
        <a href="https://docs.lospor.org" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">
          {t("nav.footerDocs")}
        </a>
        {" · "}
        <a href="https://github.com/kaloyandjunow-prog/lospor-app" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">
          {t("nav.footerOpenSource")}
        </a>
        {" · "}
        <a href="https://github.com/kaloyandjunow-prog/lospor-app/blob/main/LICENSE" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">
          AGPL-3.0
        </a>
        <span className="block mt-1 text-[10px] text-slate-300 dark:text-slate-600">
          {t("nav.footerDisclaimer")}
          {" "}
          {t("nav.footerCopyright")}
        </span>
      </footer>
    </div>
    </TourManager>
  )
}
