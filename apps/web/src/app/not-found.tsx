import Link from "next/link"
import { getLocale } from "next-intl/server"

// Without this file Next serves its own built-in 404, which renders outside the
// root layout: a light page in a dark app, with no way back. Any mistyped or
// stale case URL landed there.
//
// Bilingual inline rather than through the message catalogue, the same way
// CaseSummary handles clinical labels — a missing translation key must not be
// able to turn the error page into a second error.

export default async function NotFound() {
  const locale = await getLocale()
  const bg = locale.startsWith("bg")

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-amber-600 dark:text-amber-500">
          404
        </p>

        <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {bg ? "Страницата не съществува" : "This page does not exist"}
        </h1>

        {/* Says what to do next rather than apologising. The most common cause is
            a case that was deleted or belongs to another department, so name it. */}
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {bg
            ? "Адресът е грешен или случаят е изтрит. Възможно е и да принадлежи на друго отделение."
            : "The address is wrong, or the case was deleted. It may also belong to another department."}
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {bg ? "Към началото" : "Go to dashboard"}
          </Link>
          <Link
            href="/cases/new"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {bg ? "Нов случай" : "New case"}
          </Link>
        </div>
      </div>
    </main>
  )
}
