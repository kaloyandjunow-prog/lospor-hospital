"use client"

import { useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, MonitorSmartphone, RefreshCw, Save, UserRound } from "lucide-react"
import { useTranslations } from "next-intl"
import { passwordPolicyIssues } from "@lospor/core/account"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AccountStatusMessage,
  fetchAccountData,
  formatAccountDate,
  POLICY_KEYS,
  type AccountProfile,
  type AccountSession,
} from "./account-page-support"

type Confirmation =
  | { kind: "session"; session: AccountSession }
  | { kind: "others" }
  | null

export function AccountPageClient() {
  const t = useTranslations()
  const router = useRouter()
  const confirmTitleId = useId()
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [sessions, setSessions] = useState<AccountSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<"success" | "error" | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState(false)
  const [sessionSaving, setSessionSaving] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)

  async function loadAccount() {
    setLoading(true)
    setLoadError(false)
    try {
      const result = await fetchAccountData()
      setProfile(result.profile)
      setSessions(result.sessions)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void fetchAccountData()
      .then(result => {
        if (!active) return
        setProfile(result.profile)
        setSessions(result.sessions)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (confirmation) document.getElementById("account-session-confirm-cancel")?.focus()
  }, [confirmation])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || profileSaving) return
    setProfileSaving(true)
    setProfileMessage(null)
    const data = new FormData(event.currentTarget)
    try {
      const response = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: String(data.get("firstName") ?? "").trim(),
          lastName: String(data.get("lastName") ?? "").trim(),
          title: String(data.get("title") ?? "").trim(),
        }),
      })
      const body = await response.json().catch(() => ({})) as Partial<AccountProfile>
      if (!response.ok) throw new Error("profile update failed")
      setProfile(previous => previous ? { ...previous, ...body } : previous)
      setProfileMessage("success")
      router.refresh()
    } catch {
      setProfileMessage("error")
    } finally {
      setProfileSaving(false)
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (passwordSaving) return
    const form = event.currentTarget
    const data = new FormData(form)
    const currentPassword = String(data.get("currentPassword") ?? "")
    const newPassword = String(data.get("newPassword") ?? "")
    const confirmPassword = String(data.get("confirmPassword") ?? "")
    const issues = passwordPolicyIssues(newPassword)
    if (issues.length > 0) {
      setPasswordError(POLICY_KEYS[issues[0]])
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("account.passwordMismatch")
      return
    }

    setPasswordSaving(true)
    setPasswordError(null)
    try {
      const response = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (!response.ok) {
        setPasswordError(response.status === 409
          ? "account.passwordReuseOrConflict"
          : response.status === 400
            ? "account.currentPasswordIncorrect"
            : "account.passwordChangeFailed")
        return
      }
      form.reset()
      router.replace("/login?passwordChanged=1")
      router.refresh()
    } catch {
      setPasswordError("account.passwordChangeFailed")
    } finally {
      setPasswordSaving(false)
    }
  }

  async function confirmSessionAction() {
    if (!confirmation || sessionSaving) return
    setSessionSaving(true)
    setSessionError(false)
    try {
      const response = confirmation.kind === "others"
        ? await fetch("/api/user/sessions", { method: "DELETE" })
        : await fetch(`/api/user/sessions/${encodeURIComponent(confirmation.session.id)}`, { method: "DELETE" })
      if (!response.ok) throw new Error("session revocation failed")
      setSessions(previous => confirmation.kind === "others"
        ? previous.filter(session => session.current)
        : previous.filter(session => session.id !== confirmation.session.id))
      setConfirmation(null)
    } catch {
      setSessionError(true)
    } finally {
      setSessionSaving(false)
    }
  }

  if (loading) {
    return <p role="status" className="py-12 text-center text-sm text-slate-500">{t("account.loading")}</p>
  }

  if (loadError || !profile) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900 dark:bg-red-950/20">
        <AccountStatusMessage kind="error">{t("account.loadFailed")}</AccountStatusMessage>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void loadAccount()}>
          <RefreshCw /> {t("account.retry")}
        </Button>
      </div>
    )
  }

  const locale = typeof document === "undefined" ? "bg" : document.documentElement.lang || "bg"
  const otherSessionCount = sessions.filter(session => !session.current).length
  const clientTypeLabel = (clientType: string) => {
    const known = ["WEB", "NATIVE", "PWA"] as const
    return known.includes(clientType as typeof known[number])
      ? t(`account.clientTypes.${clientType}`)
      : clientType
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("account.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("account.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserRound /> {t("account.profileTitle")}</CardTitle>
          <CardDescription>{t("account.profileDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveProfile}>
            <div className="space-y-1.5">
              <Label htmlFor="account-title">{t("account.professionalTitle")}</Label>
              <Input id="account-title" name="title" maxLength={100} defaultValue={profile.title ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-email">{t("account.email")}</Label>
              <Input id="account-email" value={profile.email} readOnly aria-describedby="account-email-help" />
              <p id="account-email-help" className="text-xs text-slate-500">{t("account.emailGoverned")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-first-name">{t("account.firstName")}</Label>
              <Input id="account-first-name" name="firstName" required maxLength={100} defaultValue={profile.firstName ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-last-name">{t("account.lastName")}</Label>
              <Input id="account-last-name" name="lastName" required maxLength={100} defaultValue={profile.lastName ?? ""} />
            </div>
            <div className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-[#181818]">
              <span className="font-medium">{t("account.institution")}:</span>{" "}
              {profile.institution
                ? `${profile.institution.name}${profile.institution.city ? ` — ${profile.institution.city}` : ""}`
                : t("account.noInstitution")}
              <p className="mt-1 text-xs text-slate-500">{t("account.institutionGoverned")}</p>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={profileSaving}>
                <Save /> {profileSaving ? t("account.saving") : t("account.saveProfile")}
              </Button>
              {profileMessage === "success" && <AccountStatusMessage kind="success">{t("account.profileSaved")}</AccountStatusMessage>}
              {profileMessage === "error" && <AccountStatusMessage kind="error">{t("account.profileSaveFailed")}</AccountStatusMessage>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound /> {t("account.passwordTitle")}</CardTitle>
          <CardDescription>{t("account.passwordDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={changePassword}>
            <div className="space-y-1.5">
              <Label htmlFor="current-password">{t("account.currentPassword")}</Label>
              <Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">{t("account.newPassword")}</Label>
              <Input id="new-password" name="newPassword" type="password" autoComplete="new-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">{t("account.confirmPassword")}</Label>
              <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required />
            </div>
            <p className="sm:col-span-3 text-xs text-slate-500">{t("account.passwordConsequence")}</p>
            <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={passwordSaving}>
                <KeyRound /> {passwordSaving ? t("account.changingPassword") : t("account.changePassword")}
              </Button>
              {passwordError && <AccountStatusMessage kind="error">{t(passwordError)}</AccountStatusMessage>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MonitorSmartphone /> {t("account.sessionsTitle")}</CardTitle>
          <CardDescription>{t("account.sessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessionError && <AccountStatusMessage kind="error">{t("account.sessionActionFailed")}</AccountStatusMessage>}
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-500">{t("account.noSessions")}</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-[#303030] dark:border-[#303030]">
              {sessions.map(session => (
                <li key={session.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {session.deviceLabel || t("account.unknownDevice")}
                      </p>
                      {session.current && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
                          {t("account.currentSession")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("account.clientType")}: {clientTypeLabel(session.clientType)} · {t("account.lastSeen")}: {formatAccountDate(session.lastSeenAt, locale)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t("account.expires")}: {formatAccountDate(session.expiresAt, locale)}
                    </p>
                  </div>
                  {session.current ? null : (
                    <Button type="button" variant="outline" onClick={() => setConfirmation({ kind: "session", session })}>
                      {t("account.revokeSession")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={otherSessionCount === 0}
            onClick={() => setConfirmation({ kind: "others" })}
          >
            {t("account.revokeOtherSessions", { count: otherSessionCount })}
          </Button>
        </CardContent>
      </Card>

      {confirmation && (
        <section
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={confirmTitleId}
          className="fixed inset-x-4 bottom-4 z-[210] mx-auto max-w-lg rounded-xl border border-amber-300 bg-white p-4 shadow-2xl dark:border-amber-800 dark:bg-[#1c1c1c]"
        >
          <h2 id={confirmTitleId} className="font-semibold text-slate-900 dark:text-slate-100">
            {confirmation.kind === "others" ? t("account.confirmOthersTitle") : t("account.confirmSessionTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {confirmation.kind === "others"
              ? t("account.confirmOthersDescription")
              : t("account.confirmSessionDescription", {
                  device: confirmation.session.deviceLabel || t("account.unknownDevice"),
                })}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button id="account-session-confirm-cancel" type="button" variant="outline" disabled={sessionSaving} onClick={() => setConfirmation(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={sessionSaving} onClick={() => void confirmSessionAction()}>
              {sessionSaving ? t("account.revoking") : t("account.confirmRevoke")}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
