"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Download, ExternalLink, Printer } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  administratorMfaErrorKey,
  parseAdministratorMfaSuccess,
  type AdministratorMfaChallenge,
  type AdministratorMfaSuccess,
} from "@/lib/administrator-mfa-client"

function secondsRemaining(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function MfaLoginStep({
  challenge,
  onAuthenticated,
  onStartOver,
}: {
  challenge: AdministratorMfaChallenge
  onAuthenticated: (body: AdministratorMfaSuccess) => Promise<void>
  onStartOver: () => void
}) {
  const t = useTranslations()
  const [remaining, setRemaining] = useState(() => secondsRemaining(challenge.expiresAt))
  const [entryKind, setEntryKind] = useState<"authenticator" | "recovery">("authenticator")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [terminal, setTerminal] = useState(false)
  const [success, setSuccess] = useState<AdministratorMfaSuccess | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null)

  const recoveryCodes = success?.recoveryCodes
  const expired = remaining === 0

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(secondsRemaining(challenge.expiresAt))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [challenge.expiresAt])

  useEffect(() => {
    if (!recoveryCodes) return
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", guard)
    return () => window.removeEventListener("beforeunload", guard)
  }, [recoveryCodes])

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (expired || terminal) return

    const submittedCode = entryKind === "authenticator"
      ? code.replace(/[\s-]/g, "")
      : code.trim()
    if (entryKind === "authenticator" && !/^\d{6}$/.test(submittedCode)) {
      setErrorKey("mfa.authenticatorCodeInvalid")
      return
    }
    if (entryKind === "recovery" && submittedCode.length < 6) {
      setErrorKey("mfa.recoveryCodeInvalid")
      return
    }

    setLoading(true)
    setErrorKey(null)
    let authenticated: AdministratorMfaSuccess | null = null
    try {
      const response = await fetch("/api/auth/mfa/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeToken: challenge.challengeToken,
          code: submittedCode,
        }),
      })
      const body: unknown = await response.json().catch(() => ({}))
      if (!response.ok) {
        setErrorKey(administratorMfaErrorKey(response.status))
        if (response.status === 409) setTerminal(true)
        return
      }

      const parsed = parseAdministratorMfaSuccess(body, challenge.enrollmentRequired)
      if (!parsed) {
        setErrorKey(challenge.enrollmentRequired
          ? "mfa.recoveryCodesUnavailable"
          : "mfa.invalidResponse")
        setTerminal(true)
        return
      }

      if (parsed.recoveryCodes) {
        setSuccess(parsed)
        return
      }
      authenticated = parsed
      await onAuthenticated(parsed)
    } catch {
      if (authenticated) {
        setSuccess(authenticated)
        setErrorKey("mfa.continueFailed")
      } else {
        setErrorKey("mfa.networkError")
      }
    } finally {
      setLoading(false)
    }
  }

  async function copyManualKey() {
    if (!challenge.manualKey) return
    try {
      await navigator.clipboard.writeText(challenge.manualKey)
      setCopyStatus("copied")
    } catch {
      setCopyStatus("failed")
    }
  }

  function downloadRecoveryCodes() {
    if (!recoveryCodes) return
    try {
      const content = `${t("mfa.recoveryFileTitle")}\n\n${recoveryCodes.join("\n")}\n\n${t("mfa.recoveryFileWarning")}\n`
      const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url
      link.download = "lospor-recovery-codes.txt"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setErrorKey("mfa.saveFailed")
    }
  }

  async function continueAuthenticated() {
    if (!success || (recoveryCodes && !acknowledged)) return
    setLoading(true)
    setErrorKey(null)
    try {
      await onAuthenticated(success)
    } catch {
      setErrorKey("mfa.continueFailed")
      setLoading(false)
    }
  }

  if (recoveryCodes) {
    return (
      <section aria-labelledby="mfa-recovery-title" className="space-y-4">
        <div>
          <h2 id="mfa-recovery-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t("mfa.recoveryTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t("mfa.recoveryDescription")}
          </p>
        </div>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t("mfa.recoveryWarning")}
        </div>
        <ol
          aria-label={t("mfa.recoveryListLabel")}
          className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900"
        >
          {recoveryCodes.map((recoveryCode, index) => (
            <li key={recoveryCode} className="select-all">
              <span className="mr-2 text-slate-400" aria-hidden="true">{index + 1}.</span>
              {recoveryCode}
            </li>
          ))}
        </ol>
        <div className="grid gap-2 sm:grid-cols-2 print:hidden">
          <Button type="button" variant="outline" onClick={downloadRecoveryCodes}>
            <Download aria-hidden="true" />
            {t("mfa.saveCodes")}
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            {t("mfa.printCodes")}
          </Button>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 print:hidden">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={event => setAcknowledged(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>{t("mfa.recoveryAcknowledgement")}</span>
        </label>
        {errorKey && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(errorKey)}</p>
        )}
        <Button
          type="button"
          className="w-full print:hidden"
          disabled={!acknowledged || loading}
          onClick={continueAuthenticated}
        >
          {loading ? t("mfa.continuing") : t("mfa.continue")}
        </Button>
      </section>
    )
  }

  if (success) {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {t(errorKey ?? "mfa.continueFailed")}
        </p>
        <Button type="button" className="w-full" disabled={loading} onClick={continueAuthenticated}>
          {loading ? t("mfa.continuing") : t("mfa.continue")}
        </Button>
      </div>
    )
  }

  if (expired || terminal) {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {t(expired ? "mfa.expired" : errorKey ?? "mfa.challengeEnded")}
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={onStartOver}>
          {t("mfa.startOver")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {challenge.enrollmentRequired && (
        <section aria-labelledby="mfa-setup-title" className="space-y-3">
          <h2 id="mfa-setup-title" className="font-semibold text-slate-900 dark:text-slate-100">
            {t("mfa.setupTitle")}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("mfa.setupDescription")}</p>
          {challenge.otpauthUri && (
            <a
              href={challenge.otpauthUri}
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              {t("mfa.openAuthenticator")}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          {challenge.manualKey && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("mfa.manualKeyLabel")}</p>
              <code className="mt-1 block break-all text-sm font-semibold text-slate-900 dark:text-slate-100">
                {challenge.manualKey}
              </code>
              <Button type="button" variant="outline" className="mt-3" onClick={copyManualKey}>
                {t("mfa.copyManualKey")}
              </Button>
              {copyStatus && (
                <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  {t(copyStatus === "copied" ? "mfa.manualKeyCopied" : "mfa.manualKeyCopyFailed")}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <p className="text-sm text-slate-600 dark:text-slate-400">
        {t("mfa.expiresIn", { time: clock(remaining) })}
      </p>

      <form onSubmit={submitCode} className="space-y-4" noValidate>
        <div className="space-y-1">
          <Label htmlFor="mfa-code">
            {t(entryKind === "authenticator" ? "mfa.authenticatorCode" : "mfa.recoveryCode")}
          </Label>
          <Input
            id="mfa-code"
            autoFocus
            autoComplete="one-time-code"
            inputMode={entryKind === "authenticator" ? "numeric" : "text"}
            pattern={entryKind === "authenticator" ? "[0-9]*" : undefined}
            maxLength={entryKind === "authenticator" ? 6 : 64}
            value={code}
            onChange={event => setCode(event.target.value)}
            spellCheck={false}
            aria-invalid={Boolean(errorKey)}
            aria-describedby={errorKey ? "mfa-code-error" : undefined}
          />
          {errorKey && (
            <p id="mfa-code-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {t(errorKey)}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("mfa.verifying") : t("mfa.verify")}
        </Button>
      </form>

      {!challenge.enrollmentRequired && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setEntryKind(current => current === "authenticator" ? "recovery" : "authenticator")
            setCode("")
            setErrorKey(null)
          }}
        >
          {t(entryKind === "authenticator" ? "mfa.useRecoveryCode" : "mfa.useAuthenticatorCode")}
        </Button>
      )}
      <Button type="button" variant="outline" className="w-full" onClick={onStartOver}>
        {t("mfa.startOver")}
      </Button>
    </div>
  )
}
