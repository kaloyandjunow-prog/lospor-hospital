import Link from "next/link"
import { getTranslations } from "next-intl/server"

export default async function NotFound() {
  const t = await getTranslations("pwa")
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f5f7f6] px-4 text-center dark:bg-[#090b0c]">
      <div className="max-w-md space-y-4">
        {/* Readable, not decorative. slate-300 on #f5f7f6 (and slate-700 on
            #090b0c) is around 1.3:1 — axe reports it as a serious contrast
            violation, and on a bright ward screen the number is simply not
            there. */}
        <p className="text-6xl font-black text-slate-600 dark:text-slate-300" aria-hidden>404</p>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("notFoundTitle")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("notFoundDescription")}</p>
        <Link href="/dashboard" className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          {t("returnToDashboard")}
        </Link>
      </div>
    </main>
  )
}
