"use client"

import { Check } from "lucide-react"
import { useTranslations } from "next-intl"
import { passwordPolicyIssues } from "@lospor/core/account"

export function PasswordStrength({ value }: { value: string }) {
  const t = useTranslations()
  const issues = new Set(passwordPolicyIssues(value))
  const checks = [
    { label: t("auth.pwLength"), ok: !issues.has("too_short") },
    { label: t("auth.pwUppercase"), ok: !issues.has("missing_uppercase") },
    { label: t("auth.pwNumber"), ok: !issues.has("missing_number") },
    { label: t("auth.pwSpecial"), ok: !issues.has("missing_special") },
  ]
  return (
    <div className="space-y-1 pt-1">
      {checks.map(check => (
        <div key={check.label} className={`flex items-center gap-1.5 text-xs ${check.ok ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
          <Check className={`h-3 w-3 ${check.ok ? "opacity-100" : "opacity-30"}`} />
          {check.label}
        </div>
      ))}
    </div>
  )
}
