"use client"

import { useState, useRef } from "react"
import { Sparkles, X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import type { PreopData } from "@/components/forms/PreopForm"

interface Props {
  getFormData: () => PreopData
  caseId?: string | null
  onSaveBeforeAI?: () => Promise<void>
}

type Status = "idle" | "loading" | "done" | "error"

export function AIAdvisor({ getFormData, caseId, onSaveBeforeAI }: Props) {
  const t = useTranslations()
  const [open, setOpen]     = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [text, setText]     = useState("")
  const [error, setError]   = useState("")
  const abortRef            = useRef<AbortController | null>(null)

  async function runAnalysis() {
    setOpen(true)
    setStatus("loading")
    setText("")
    setError("")

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      if (caseId) await onSaveBeforeAI?.()
      const res = caseId
        ? await fetch(`/api/cases/${caseId}/ai/advise`, { method: "POST", signal: ac.signal })
        : await fetch("/api/ai/advise", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(getFormData()),
            signal: ac.signal,
          })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        setText(buf)
      }

      setStatus("done")
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return
      setError(err instanceof Error ? err.message : "Unknown error")
      setStatus("error")
    }
  }

  function dismiss() {
    abortRef.current?.abort()
    setOpen(false)
    setStatus("idle")
    setText("")
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={runAnalysis}
          disabled={status === "loading"}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          size="lg"
        >
          <Sparkles className="h-4 w-4" />
          {status === "loading" ? t("ai.analysing") : t("ai.button")}
        </Button>
        {open && status !== "loading" && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {open ? t("ai.collapse") : t("ai.expand")}
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-violet-100 dark:bg-violet-900 border-b border-violet-200 dark:border-violet-800">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-semibold text-violet-800 dark:text-violet-200">{t("ai.header")}</span>
            </div>
            <button type="button" onClick={dismiss} className="text-violet-400 hover:text-violet-700 dark:text-violet-500 dark:hover:text-violet-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("ai.disclaimer")}
            </p>
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            {status === "loading" && text === "" && (
              <div className="flex items-center gap-2 text-violet-600 text-sm py-4">
                <span className="animate-spin">⟳</span>
                <span>{t("ai.analysingData")}</span>
              </div>
            )}

            {status === "error" && (
              <div className="text-red-600 text-sm py-2">
                {t("ai.errorPrefix")}: {error}. {t("ai.errorHint")}
              </div>
            )}

            {text && <MarkdownOutput text={text} />}
          </div>
        </div>
      )}
    </div>
  )
}

// Minimal markdown renderer — handles ## headers, **bold**, and bullet lists
function MarkdownOutput({ text }: { text: string }) {
  const lines = text.split("\n")

  return (
    <div className="text-sm text-slate-800 space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h3 key={i} className="text-base font-bold text-violet-800 dark:text-violet-300 mt-4 mb-1 first:mt-0 border-b border-violet-200 dark:border-violet-700 pb-1">
              {line.slice(3)}
            </h3>
          )
        }
        if (line.startsWith("### ")) {
          return <h4 key={i} className="font-semibold text-slate-700 mt-2">{line.slice(4)}</h4>
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span className="text-violet-500 dark:text-violet-400 shrink-0 mt-0.5">•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          )
        }
        if (line.trim() === "") return <div key={i} className="h-1" />
        return <p key={i}>{renderInline(line)}</p>
      })}
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
          : p
      )}
    </>
  )
}
