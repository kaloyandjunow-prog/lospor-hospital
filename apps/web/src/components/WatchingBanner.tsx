"use client"
import { useTranslations } from "next-intl"

type Props = { onTakeover: () => void; holderName?: string | null }

export function WatchingBanner({ onTakeover, holderName }: Props) {
  const t = useTranslations()
  const message = holderName
    ? t("case.watchingNamed", { name: holderName })
    : t("case.watchingAnonymous")

  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-amber-400/40 bg-amber-500/10 px-4 py-3 backdrop-blur-sm">
      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
        ⚠ {message}
      </span>
      <button
        onClick={onTakeover}
        className="ml-auto shrink-0 rounded-md border border-amber-400 px-3 py-1 text-xs font-bold text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
      >
        {t("case.takeOverEditing")}
      </button>
    </div>
  )
}
