"use client"

import { useEffect, useId } from "react"
import { ShieldAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AdminAccount } from "./AdminAccountTable"

export type PendingAccountAction =
  | { kind: "suspend" | "reactivate" | "restore" | "delete"; account: AdminAccount }
  | { kind: "role"; account: AdminAccount; role: "MEMBER" | "HEAD_OF_DEPT" | "ADMIN" }
  | { kind: "accountKind"; account: AdminAccount; accountKind: "CLINICAL" | "RESEARCH_ONLY" }

function normalizedRole(role: string) {
  if (role === "ADMIN" || role === "HEAD_OF_DEPT") return role
  return "MEMBER"
}

export function isSecureAuthorityAction(action: PendingAccountAction) {
  return action.kind === "accountKind"
    || (action.kind === "role"
      && (action.role === "ADMIN" || normalizedRole(action.account.role) === "ADMIN"))
}

function titleKey(action: PendingAccountAction) {
  if (action.kind === "delete") return "admin.deleteAccountTitle"
  if (action.kind === "suspend") return "admin.suspendAccountTitle"
  if (action.kind === "reactivate") return "admin.reactivateAccountTitle"
  if (action.kind === "restore") return "admin.restoreAccountTitle"
  return "admin.changeAuthorityTitle"
}

function descriptionKey(action: PendingAccountAction) {
  if (action.kind === "delete") return "admin.deleteAccountDescription"
  if (action.kind === "suspend") return "admin.suspendAccountDescription"
  if (action.kind === "reactivate") return "admin.reactivateAccountDescription"
  if (action.kind === "restore") return "admin.restoreAccountDescription"
  if (
    action.kind === "role"
    && normalizedRole(action.account.role) === "HEAD_OF_DEPT"
    && action.role === "MEMBER"
  ) return "admin.hodDemotionKeepsCases"
  return "admin.changeAuthorityDescription"
}

export function AdminAccountActionConfirmation({
  action,
  reason,
  password,
  deleteConfirmation,
  saving,
  errorKey,
  canSubmit,
  onReasonChange,
  onPasswordChange,
  onDeleteConfirmationChange,
  onCancel,
  onConfirm,
}: {
  action: PendingAccountAction
  reason: string
  password: string
  deleteConfirmation: string
  saving: boolean
  errorKey: string | null
  canSubmit: boolean
  onReasonChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onDeleteConfirmationChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations()
  const titleId = useId()
  const secureAuthority = isSecureAuthorityAction(action)
  const standardRole = action.kind === "role" && !secureAuthority

  useEffect(() => {
    document.getElementById("admin-account-action-cancel")?.focus()
  }, [action])

  return (
    <section
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="fixed inset-x-4 bottom-4 z-[220] mx-auto max-w-lg rounded-xl border border-slate-300 bg-white p-5 shadow-2xl dark:border-[#3a3a3a] dark:bg-[#1c1c1c]"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h2 id={titleId} className="font-semibold text-slate-900 dark:text-slate-100">{t(titleKey(action))}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t(descriptionKey(action), { email: action.account.email })}
          </p>
        </div>
      </div>

      {action.kind === "delete" ? (
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="admin-delete-confirmation">{t("admin.typeEmailToConfirm")}</Label>
          <Input id="admin-delete-confirmation" value={deleteConfirmation}
            onChange={event => onDeleteConfirmationChange(event.target.value)} autoComplete="off" />
        </div>
      ) : standardRole ? null : (
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-action-reason">{t("admin.reason")}</Label>
            <Input id="admin-action-reason" value={reason} onChange={event => onReasonChange(event.target.value)}
              minLength={3} maxLength={500} autoComplete="off" />
          </div>
          {secureAuthority && (
            <div className="space-y-1.5">
              <Label htmlFor="admin-current-password">{t("admin.yourCurrentPassword")}</Label>
              <Input id="admin-current-password" type="password" value={password}
                onChange={event => onPasswordChange(event.target.value)} autoComplete="current-password" />
              <p className="text-xs text-slate-500">{t("admin.authorityReauthentication")}</p>
            </div>
          )}
        </div>
      )}

      {errorKey && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{t(errorKey)}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button id="admin-account-action-cancel" type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="button" variant={action.kind === "delete" || action.kind === "suspend" ? "destructive" : "default"}
          disabled={saving || !canSubmit} onClick={onConfirm}>
          {saving ? t("admin.savingAccountAction") : t("admin.confirmAccountAction")}
        </Button>
      </div>
    </section>
  )
}
