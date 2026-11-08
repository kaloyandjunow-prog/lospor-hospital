"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

export function BrandBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[72vh] max-h-[720px] w-[min(760px,96vw)] opacity-90"
      style={{
        clipPath: "polygon(38% 0, 62% 0, 88% 100%, 12% 100%)",
        background:
          "linear-gradient(to bottom, rgba(246,173,47,.16), rgba(246,173,47,.035) 45%, transparent 100%)",
      }}
    />
  )
}

export function LosporBrand({
  compact = false,
  linked = false,
}: {
  compact?: boolean
  linked?: boolean
}) {
  const t = useTranslations()
  const content = (
    <div className={`flex items-center ${compact ? "gap-3" : "flex-col text-center"}`}>
      <div className={compact ? "h-12 w-12" : "h-28 w-28"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lospor-symbol-light.svg" alt="" className="h-full w-full dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lospor-symbol-dark.svg" alt="" className="hidden h-full w-full dark:block" />
      </div>
      <div className={compact ? "" : "-mt-1"}>
        <div className={`${compact ? "text-xl" : "text-4xl"} font-bold text-slate-900 dark:text-[#f7f8f5]`}>
          LOSPOR
        </div>
        {!compact && (
          <div className="mt-1 text-[10px] font-medium text-[#9c6200] dark:text-[#f6ad2f] sm:text-xs">
            {t("common.appFullName").toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )

  return linked ? (
    // The full mark shows "LOSPOR" and the full name, so the link is named by what it shows; an aria-label
    // that leaves the visible words out fails WCAG 2.5.3 (Label in Name). The compact mark shows only
    // "LOSPOR", which "LOSPOR home" contains.
    <Link href="/login" aria-label={compact ? t("common.homeAria") : undefined} className="inline-block transition-opacity hover:opacity-80">
      {content}
    </Link>
  ) : content
}
