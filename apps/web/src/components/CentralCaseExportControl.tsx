"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  centralCaseExportControlUrl,
  parseCentralCaseExportControl,
  type CentralCaseExportControl,
} from "@/lib/central-case-export-control"

type RequestResult =
  | { kind: "ok"; control: CentralCaseExportControl }
  | { kind: "access" | "notFound" | "malformed" | "unavailable" | "conflict" }

type ViewState =
  | { phase: "loading" }
  | { phase: "ready"; control: CentralCaseExportControl }
  | { phase: "failed"; reason: "access" | "notFound" | "unavailable" }

async function requestControl(url: string, init: RequestInit = {}): Promise<RequestResult> {
  try {
    const headers = new Headers(init.headers)
    headers.set("accept", "application/json")
    if (init.body !== undefined) headers.set("content-type", "application/json")

    const response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "same-origin",
    })
    if (response.status === 401 || response.status === 403) return { kind: "access" }
    if (response.status === 404) return { kind: "notFound" }
    if (response.status === 409) return { kind: "conflict" }
    if (!response.ok) return { kind: "unavailable" }

    const body = await response.json().catch(() => null)
    const control = parseCentralCaseExportControl(body)
    return control ? { kind: "ok", control } : { kind: "malformed" }
  } catch {
    return { kind: "unavailable" }
  }
}

function safeFailure(result: Exclude<RequestResult, { kind: "ok" }>): ViewState {
  if (result.kind === "access") return { phase: "failed", reason: "access" }
  if (result.kind === "notFound") return { phase: "failed", reason: "notFound" }
  return { phase: "failed", reason: "unavailable" }
}

/**
 * Privacy-safe view of one case's automatic Central delivery. The only prop is the
 * internal route key: patient references and case content never cross this
 * client boundary or enter the Central-control response model.
 */
export function CentralCaseExportControl({
  caseId,
  initialControl,
}: {
  caseId: string
  initialControl?: CentralCaseExportControl
}) {
  const t = useTranslations("centralExport")
  const locale = useLocale()
  const url = centralCaseExportControlUrl(caseId)
  const requestSequence = useRef(0)
  const savingRef = useRef(false)
  const [view, setView] = useState<ViewState>(initialControl
    ? { phase: "ready", control: initialControl }
    : { phase: "loading" })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<"updated" | "conflict" | null>(null)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [resendOpen, setResendOpen] = useState(false)

  const applyResult = useCallback((result: RequestResult) => {
    if (result.kind === "ok") {
      setView({ phase: "ready", control: result.control })
      return
    }
    setView(safeFailure(result))
  }, [])

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current
    setFeedback(null)
    setView({ phase: "loading" })
    const result = await requestControl(url)
    if (sequence !== requestSequence.current) return
    applyResult(result)
  }, [applyResult, url])

  useEffect(() => {
    const initialLoad = initialControl
      ? undefined
      : window.setTimeout(() => { void load() }, 0)
    const revalidate = () => {
      if (!savingRef.current) void load()
    }
    window.addEventListener("focus", revalidate)
    return () => {
      if (initialLoad !== undefined) window.clearTimeout(initialLoad)
      requestSequence.current += 1
      window.removeEventListener("focus", revalidate)
    }
  }, [initialControl, load])

  async function updateAction(action: "WITHDRAW" | "RESEND") {
    const sequence = ++requestSequence.current
    savingRef.current = true
    setSaving(true)
    setFeedback(null)

    const result = await requestControl(url, {
      method: "PUT",
      body: JSON.stringify({ action }),
    })
    if (sequence !== requestSequence.current) {
      savingRef.current = false
      setSaving(false)
      return
    }

    if (result.kind === "conflict") {
      setView({ phase: "loading" })
      const refreshed = await requestControl(url)
      if (sequence === requestSequence.current) {
        applyResult(refreshed)
        if (refreshed.kind === "ok") setFeedback("conflict")
      }
    } else {
      applyResult(result)
      if (result.kind === "ok") setFeedback("updated")
    }

    savingRef.current = false
    setSaving(false)
  }

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(
    locale === "bg" ? "bg-BG" : "en-GB",
    { dateStyle: "medium", timeStyle: "short" },
  ), [locale])

  return (
    <section
      aria-labelledby="central-export-title"
      className="max-w-4xl mx-auto mb-6 rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20"
      data-testid="central-case-export-control"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="central-export-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t("title")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{t("description")}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t("privacyBoundary")}</p>
        </div>
        {view.phase === "ready" ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={saving}>
            {t("refresh")}
          </Button>
        ) : null}
      </div>

      {view.phase === "loading" ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300" role="status" aria-live="polite">
          {t("loading")}
        </p>
      ) : null}

      {view.phase === "failed" ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm text-amber-900 dark:text-amber-100" role="alert">
            {t(`failures.${view.reason}`)}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {view.phase === "ready" ? (() => {
        const control = view.control
        return (
          <div className="mt-4 space-y-4">
            <dl className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900/50">
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("stateLabel")}</dt>
                <dd className="mt-1 font-semibold text-slate-800 dark:text-slate-100" data-testid="central-export-state">
                  {t(`states.${control.state}`)}
                </dd>
              </div>
              {control.decidedAt ? (
                <div>
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("changedAtLabel")}</dt>
                  <dd className="mt-1 text-slate-700 dark:text-slate-200">
                    <time dateTime={control.decidedAt}>{dateFormatter.format(new Date(control.decidedAt))}</time>
                  </dd>
                </div>
              ) : null}
            </dl>

            {control.lastBatch ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("latestDelivery")}
                </h3>
                <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">{t("deliveryStatusLabel")}</dt>
                    <dd className="mt-1 text-slate-800 dark:text-slate-100">
                      {t(`deliveryStatuses.${control.lastBatch.status}`)}
                    </dd>
                  </div>
                  {control.lastBatch.action ? (
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">{t("deliveryActionLabel")}</dt>
                      <dd className="mt-1 text-slate-800 dark:text-slate-100">
                        {t(`deliveryActions.${control.lastBatch.action}`)}
                      </dd>
                    </div>
                  ) : null}
                  {control.lastBatch.acceptedAt ? (
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">{t("acceptedAtLabel")}</dt>
                      <dd className="mt-1 text-slate-800 dark:text-slate-100">
                        <time dateTime={control.lastBatch.acceptedAt}>
                          {dateFormatter.format(new Date(control.lastBatch.acceptedAt))}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {control.lastBatch.errorCode ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t("codedDeliveryError")}</p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2" aria-labelledby="central-delivery-actions-title">
              <h3 id="central-delivery-actions-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t("actionsTitle")}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">{t("automaticDelivery")}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {control.canWithdraw ? (
                  <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                    <AlertDialogTrigger render={<Button type="button" variant="destructive" size="sm" disabled={saving} />}>
                      {t("withdraw")}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("withdrawConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("withdrawConfirmDescription")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => {
                            setWithdrawOpen(false)
                            void updateAction("WITHDRAW")
                          }}
                        >
                          {t("confirmWithdraw")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}

                {control.canResend ? (
                  <AlertDialog open={resendOpen} onOpenChange={setResendOpen}>
                    <AlertDialogTrigger render={<Button type="button" size="sm" disabled={saving} />}>
                      {t("resend")}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("resendConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("resendConfirmDescription")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            setResendOpen(false)
                            void updateAction("RESEND")
                          }}
                        >
                          {t("confirmResend")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
              {!control.canWithdraw && !control.canResend ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("noActionAvailable")}</p>
              ) : null}
            </div>

            {feedback ? (
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200" role="status" aria-live="polite">
                {t(`feedback.${feedback}`)}
              </p>
            ) : null}
          </div>
        )
      })() : null}
    </section>
  )
}
