import { ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export function PreopSubmitAction({ submitting, error, disabled = false }: { submitting: boolean; error?: string | null; disabled?: boolean }) {
  const t = useTranslations()
  return (
    <div className="space-y-2" data-tour="preop-submit">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={submitting || disabled} className="gap-2 bg-blue-600 hover:bg-blue-700">
          {submitting ? t("case.savingDraft") : t("preop.continueIntraop")} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
