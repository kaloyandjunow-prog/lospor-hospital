"use client"

import { useState } from "react"
import { RotateCcw, Trash2, UserCheck, UserX } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAccountAdministrationCapability } from "@/lib/account-administration-capability"
import { Button } from "@/components/ui/button"
import {
  AdminAccountActionConfirmation,
  isSecureAuthorityAction,
  type PendingAccountAction,
} from "./AdminAccountActionConfirmation"

export type AccountLifecycleStatus =
  | "INVITED"
  | "ACTIVE"
  | "SUSPENDED"
  | "DELETION_PENDING"
  | "RECOVERY_REQUIRED"

export type AdminAccount = {
  id: string
  email: string
  name: string
  firstName: string
  lastName: string
  title: string
  role: string
  accountKind?: "CLINICAL" | "RESEARCH_ONLY"
  status?: AccountLifecycleStatus
  emailVerifiedAt?: string | null
  suspendedAt?: string | null
  recoveryRequiredAt?: string | null
  deletedAt?: string | null
  deletionDeadline?: string | null
  lastLoginAt?: string | null
  passwordChangedAt?: string | null
  preferredLocale?: string
  legalCurrent?: boolean | null
  createdAt: string
  institution: { id?: string; name: string; city: string } | null
}

function normalizedRole(role: string): "MEMBER" | "HEAD_OF_DEPT" | "ADMIN" {
  if (role === "ADMIN" || role === "HEAD_OF_DEPT") return role
  return "MEMBER"
}

function derivedStatus(account: AdminAccount): AccountLifecycleStatus {
  if (account.status) return account.status
  if (account.deletedAt) return "DELETION_PENDING"
  if (account.suspendedAt) return "SUSPENDED"
  if (account.recoveryRequiredAt) return "RECOVERY_REQUIRED"
  if (!account.emailVerifiedAt) return "INVITED"
  return "ACTIVE"
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(value))
}

function actionErrorKey(status: number) {
  if (status === 401) return "admin.accountPasswordIncorrect"
  if (status === 403) return "admin.accountAdministrationDisabled"
  if (status === 409 || status === 422) return "admin.accountConflict"
  return "admin.accountActionFailed"
}

export function AdminAccountTable({
  accounts,
  loading,
  currentUserId,
  onRefresh,
}: {
  accounts: AdminAccount[]
  loading: boolean
  currentUserId?: string | null
  onRefresh: () => Promise<void>
}) {
  const t = useTranslations()
  const capability = useAccountAdministrationCapability()
  const [pending, setPending] = useState<PendingAccountAction | null>(null)
  const [reason, setReason] = useState("")
  const [password, setPassword] = useState("")
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [saving, setSaving] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [successKey, setSuccessKey] = useState<string | null>(null)

  const locale = typeof document === "undefined" ? "bg" : document.documentElement.lang || "bg"
  const roleLabels = {
    MEMBER: t("admin.roleMember"),
    HEAD_OF_DEPT: t("admin.roleHOD"),
    ADMIN: t("admin.roleAdmin"),
  }

  function begin(action: PendingAccountAction) {
    setPending(action)
    setReason("")
    setPassword("")
    setDeleteConfirmation("")
    setErrorKey(null)
    setSuccessKey(null)
  }

  function close() {
    if (saving) return
    setPending(null)
    setErrorKey(null)
  }

  async function execute() {
    if (!pending || saving) return
    setSaving(true)
    setErrorKey(null)
    try {
      let response: Response
      if (pending.kind === "suspend" || pending.kind === "reactivate" || pending.kind === "restore") {
        response = await fetch(`/api/admin/users/${encodeURIComponent(pending.account.id)}/${pending.kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        })
      } else if (pending.kind === "delete") {
        response = await fetch(`/api/admin/users/${encodeURIComponent(pending.account.id)}`, {
          method: "DELETE",
        })
      } else if (
        pending.kind === "accountKind"
        || (pending.kind === "role" && isSecureAuthorityAction(pending))
      ) {
        response = await fetch(`/api/admin/users/${encodeURIComponent(pending.account.id)}/authority`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(pending.kind === "role"
              ? { role: pending.role }
              : { accountKind: pending.accountKind }),
            currentPassword: password,
            reason: reason.trim(),
          }),
        })
      } else if (pending.kind === "role") {
        response = await fetch(`/api/admin/users/${encodeURIComponent(pending.account.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: pending.role }),
        })
      } else {
        return
      }

      if (!response.ok) {
        setErrorKey(actionErrorKey(response.status))
        return
      }
      await onRefresh()
      setPending(null)
      setSuccessKey("admin.accountActionSucceeded")
    } catch {
      setErrorKey("admin.accountActionFailed")
    } finally {
      setSaving(false)
    }
  }

  function actionCanSubmit(action: PendingAccountAction) {
    if (action.kind === "delete") return deleteConfirmation === action.account.email
    if (action.kind === "role" && !isSecureAuthorityAction(action)) return true
    if (isSecureAuthorityAction(action)) return reason.trim().length >= 3 && password.length > 0
    return reason.trim().length >= 3
  }

  return (
    <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-slate-200 dark:border-[#2a2a2a] overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("admin.allUsers")} {!loading && `(${accounts.length})`}
          </span>
        </div>
        {capability.enabled && (
          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            {t("admin.hospitalAccountControls")}
          </span>
        )}
      </div>
      {successKey && (
        <p role="status" className="border-b border-green-200 bg-green-50 px-5 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300">
          {t(successKey)}
        </p>
      )}
      {loading ? (
        <div role="status" className="py-16 text-center text-slate-400 animate-pulse text-sm">{t("admin.loading")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-[#161616] text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">{t("admin.colName")}</th>
                <th className="px-4 py-3 text-left font-semibold">{t("admin.colInstitution")}</th>
                {capability.enabled && <th className="px-4 py-3 text-left font-semibold">{t("admin.colStatus")}</th>}
                <th className="px-4 py-3 text-left font-semibold">{t("admin.colRole")}</th>
                {capability.enabled && <th className="px-4 py-3 text-left font-semibold">{t("admin.colActivity")}</th>}
                <th className="px-4 py-3 text-left font-semibold">
                  {t(capability.enabled ? "admin.colActions" : "admin.colJoined")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
              {accounts.map(account => {
                const role = normalizedRole(account.role)
                const status = derivedStatus(account)
                const displayName = [account.title, account.firstName || account.name, account.lastName]
                  .filter(Boolean).join(" ")
                const isSelf = account.id === currentUserId
                return (
                  <tr key={account.id} className="align-top hover:bg-slate-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{displayName || account.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{account.email}</p>
                      {isSelf && <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{t("admin.currentAccount")}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {account.institution?.name ?? "—"}
                      {account.institution?.city && <span className="block text-xs text-slate-400">{account.institution.city}</span>}
                    </td>
                    {capability.enabled && (
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          status === "ACTIVE" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : status === "SUSPENDED" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : status === "DELETION_PENDING" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}>
                          {t(`admin.status.${status}`)}
                        </span>
                        {status === "DELETION_PENDING" && account.deletionDeadline && (
                          <p className="mt-1 max-w-44 text-xs text-red-600 dark:text-red-400">
                            {t("admin.deletionDeadline", { date: formatDate(account.deletionDeadline, locale) })}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">
                          {account.legalCurrent === true
                            ? t("admin.legalCurrent")
                            : account.legalCurrent === false
                              ? t("admin.legalOutdated")
                              : t("admin.legalUnknown")}
                        </p>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {role === "ADMIN" && !capability.enabled ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          {t("admin.roleAdmin")}
                        </span>
                      ) : (
                        <label className="block">
                          <span className="sr-only">{t("admin.changeRoleFor", { name: displayName || account.email })}</span>
                          <select
                            value={role}
                            disabled={status !== "ACTIVE" || saving}
                            onChange={event => begin({
                              kind: "role",
                              account,
                              role: event.target.value as "MEMBER" | "HEAD_OF_DEPT" | "ADMIN",
                            })}
                            className="text-xs rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            <option value="MEMBER">{roleLabels.MEMBER}</option>
                            <option value="HEAD_OF_DEPT">{roleLabels.HEAD_OF_DEPT}</option>
                            {capability.enabled && <option value="ADMIN">{roleLabels.ADMIN}</option>}
                          </select>
                        </label>
                      )}
                      {capability.enabled && (
                        <label className="mt-2 block">
                          <span className="sr-only">{t("admin.changeAccountKindFor", { name: displayName || account.email })}</span>
                          <select
                            value={account.accountKind ?? "CLINICAL"}
                            disabled={status !== "ACTIVE" || saving}
                            onChange={event => begin({
                              kind: "accountKind",
                              account,
                              accountKind: event.target.value as "CLINICAL" | "RESEARCH_ONLY",
                            })}
                            className="text-xs rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            <option value="CLINICAL">{t("admin.accountKindClinical")}</option>
                            <option value="RESEARCH_ONLY">{t("admin.accountKindResearch")}</option>
                          </select>
                        </label>
                      )}
                    </td>
                    {capability.enabled && (
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <p>{t("admin.lastLoginShort")}: {formatDate(account.lastLoginAt, locale)}</p>
                        <p>{t("admin.joinedShort")}: {formatDate(account.createdAt, locale)}</p>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {capability.enabled ? (
                        <div className="flex min-w-36 flex-wrap gap-1.5">
                          {status === "SUSPENDED" && (
                            <Button type="button" size="xs" variant="outline" onClick={() => begin({ kind: "reactivate", account })}>
                              <UserCheck /> {t("admin.reactivate")}
                            </Button>
                          )}
                          {status === "DELETION_PENDING" && (
                            <Button type="button" size="xs" variant="outline" onClick={() => begin({ kind: "restore", account })}>
                              <RotateCcw /> {t("admin.restore")}
                            </Button>
                          )}
                          {(status === "ACTIVE" || status === "INVITED" || status === "RECOVERY_REQUIRED") && !isSelf && (
                            <Button type="button" size="xs" variant="outline" onClick={() => begin({ kind: "suspend", account })}>
                              <UserX /> {t("admin.suspend")}
                            </Button>
                          )}
                          {status !== "DELETION_PENDING" && !isSelf && (
                            <Button type="button" size="xs" variant="destructive" onClick={() => begin({ kind: "delete", account })}>
                              <Trash2 /> {t("admin.delete")}
                            </Button>
                          )}
                          {status === "RECOVERY_REQUIRED" && (
                            <p className="basis-full text-xs text-amber-700 dark:text-amber-400">{t("admin.recoveryRequiredHelp")}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{formatDate(account.createdAt, locale)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pending && <AdminAccountActionConfirmation
        action={pending}
        reason={reason}
        password={password}
        deleteConfirmation={deleteConfirmation}
        saving={saving}
        errorKey={errorKey}
        canSubmit={actionCanSubmit(pending)}
        onReasonChange={setReason}
        onPasswordChange={setPassword}
        onDeleteConfirmationChange={setDeleteConfirmation}
        onCancel={close}
        onConfirm={() => void execute()}
      />}
    </div>
  )
}
