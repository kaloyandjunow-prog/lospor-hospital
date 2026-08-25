"use client"

import { useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Camera, ChevronDown, ChevronUp, Loader2, Plus, ScanLine, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { displayClinicalCode } from "@/lib/clinical-display"
import {
  getLabByName,
  getLabFlag,
  LAB_CATEGORIES,
  searchLabs,
  type LabTest,
} from "@/lib/labs"
import { capabilityMessageKey, useClinicalAiCapabilities } from "@/lib/deployment-capabilities"
import { CanonicalUnit, RefBadge } from "@/components/LabResultBadges"

export type LabResult = { test: string; value: string; unit: string }

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(",")[1] ?? "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * A scanned row carries what the report printed alongside the converted value,
 * so the reviewer can verify the conversion instead of trusting it.
 */
type LabPreviewRow = LabResult & {
  sourceValue?: string
  sourceUnit?: string
  confident?: boolean
}

/** True when the stored value or unit differs from what the report printed. */
function sourceDiffers(row: LabResult): boolean {
  const r = row as LabPreviewRow
  if (r.sourceValue === undefined) return false
  return r.sourceValue !== String(row.value) || (r.sourceUnit ?? '') !== row.unit
}

export function LabResults({
  value = [],
  onChange,
}: {
  value?: LabResult[]
  onChange: (v: LabResult[]) => void
}) {
  const locale = useLocale()
  const t = useTranslations()
  const clinicalAi = useClinicalAiCapabilities()
  const [search, setSearch] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPreview, setAiPreview] = useState<LabResult[] | null>(null)
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set())
  const [aiError, setAiError] = useState<string | null>(null)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const q = search.trim()
  const filtered = q.length >= 2 ? searchLabs(q) : null

  function addTest(test: LabTest) {
    if (value.some(row => row.test === test.name)) return
    onChange([...value, { test: test.name, value: "", unit: test.unit }])
    setSearch("")
  }

  function updateValue(idx: number, nextValue: string) {
    onChange(value.map((row, rowIdx) => rowIdx === idx ? { ...row, value: nextValue } : row))
  }

  function remove(idx: number) {
    onChange(value.filter((_, rowIdx) => rowIdx !== idx))
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!clinicalAi.labImageExtraction.enabled) return
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setAiLoading(true)
    setAiPreview(null)
    setAiError(null)
    try {
      const imageBase64 = await toBase64(file)
      const res = await fetch("/api/ai/read-labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setAiError(data.error ?? t("intraop.lab.scanFailed"))
      } else if (!data.results?.length) {
        setAiError(t("intraop.lab.noImageResults"))
      } else {
        setAiPreview(data.results)
        // Only rows the server converted from a recognised unit are offered
        // ticked. A row whose printed unit was not understood is shown with its
        // source value so it can be checked against the report, but it is never
        // accepted by default.
        setAiSelected(new Set(
          data.results
            .map((row: { confident?: boolean }, i: number) => (row.confident === false ? -1 : i))
            .filter((i: number) => i >= 0),
        ))
      }
    } catch {
      setAiError(t("intraop.lab.networkError"))
    } finally {
      setAiLoading(false)
    }
  }

  function confirmAiPreview() {
    if (!aiPreview) return
    const toAdd = aiPreview
      .filter((_, i) => aiSelected.has(i))
      .filter(row => !value.some(existing => existing.test.toLowerCase() === row.test.toLowerCase()))
    onChange([...value, ...toAdd])
    setAiPreview(null)
    setAiSelected(new Set())
  }

  function toggleAiRow(idx: number) {
    setAiSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {clinicalAi.labImageExtraction.enabled ? (
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1.5">
            {t("intraop.lab.privacyWarning")}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setAiError(null); fileInputRef.current?.click() }}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("intraop.lab.scanning")}</>
                : <><ScanLine className="h-3.5 w-3.5" /> {t("intraop.lab.scanReport")}</>
              }
            </button>
            <button
              type="button"
              onClick={() => { setAiError(null); cameraInputRef.current?.click() }}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera className="h-3.5 w-3.5" /> {t("intraop.lab.takePicture")}
            </button>
          </div>
          {aiError && <p className="text-[11px] text-red-500 mt-1">{aiError}</p>}
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
      </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t(capabilityMessageKey(clinicalAi.labImageExtraction.reason))}
        </p>
      )}

      {clinicalAi.labImageExtraction.enabled && aiPreview && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 overflow-hidden">
          <div className="px-3 py-2 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              {t("intraop.lab.resultsFound", { count: aiPreview.length })}
            </span>
            <button type="button" aria-label={t("intraop.lab.closePreview")} onClick={() => setAiPreview(null)} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-blue-100 dark:divide-blue-900">
                {aiPreview.map((row, idx) => {
                  const alreadyAdded = value.some(existing => existing.test.toLowerCase() === row.test.toLowerCase())
                  return (
                    <tr key={idx} className={alreadyAdded ? "opacity-40" : ""}>
                      <td className="px-3 py-1.5 w-6">
                        <input
                          type="checkbox"
                          checked={aiSelected.has(idx) && !alreadyAdded}
                          disabled={alreadyAdded}
                          onChange={() => !alreadyAdded && toggleAiRow(idx)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-1.5 font-medium text-slate-700 dark:text-slate-300">
                        {displayClinicalCode("labTest", row.test, locale, { label: row.test })} {alreadyAdded && <span className="text-[10px] text-slate-400">{t("intraop.lab.alreadyAdded")}</span>}
                      </td>
                      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">
                        {row.value}
                        {/* Show what the report printed whenever it differs, so the
                            conversion can be checked against the paper rather than
                            trusted. */}
                        {sourceDiffers(row) && (
                          <span className="ml-1.5 text-[10px] text-slate-400">
                            {t("intraop.lab.reportValue", { value: (row as LabPreviewRow).sourceValue ?? "", unit: (row as LabPreviewRow).sourceUnit ?? "" })}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-400">
                        {row.unit}
                        {(row as LabPreviewRow).confident === false && (
                          <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-500">
                            {t("intraop.lab.unitUnrecognised")}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-blue-200 dark:border-blue-800 flex gap-2">
            <button
              type="button"
              onClick={confirmAiPreview}
              className="text-xs px-3 py-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
            >
              {t("intraop.lab.addSelected", { count: aiPreview.filter((_, i) => aiSelected.has(i) && !value.some(e => e.test.toLowerCase() === aiPreview[i].test.toLowerCase())).length })}
            </button>
            <button
              type="button"
              onClick={() => setAiPreview(null)}
              className="text-xs px-3 py-1 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:border-slate-300 transition-colors"
            >
              {t("common.dismiss")}
            </button>
          </div>
        </div>
      )}

      {value.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-[#2e2e2e] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#1a1a1a] text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2.5 font-medium w-[32%]">{t("intraop.lab.test")}</th>
                <th className="text-left px-3 py-2.5 font-medium w-[16%]">{t("intraop.lab.value")}</th>
                <th className="text-left px-3 py-2.5 font-medium w-[20%]">{t("intraop.lab.unit")}</th>
                <th className="text-left px-3 py-2.5 font-medium">{t("intraop.lab.referenceRange")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
              {value.map((row, idx) => {
                const test = getLabByName(row.test)
                const numeric = Number.parseFloat(row.value.replace(",", "."))
                const flag = test && Number.isFinite(numeric) ? getLabFlag(test, numeric) : null
                return (
                  <tr key={idx} className="group align-middle">
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">{displayClinicalCode("labTest", row.test, locale, { label: row.test })}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.value}
                        onChange={e => updateValue(idx, e.target.value)}
                        className={`h-7 text-sm px-2 w-full ${flag === "low" || flag === "high" ? "border-amber-300 dark:border-amber-700" : ""}`}
                        placeholder="-"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <CanonicalUnit unit={row.unit} unitless={t("intraop.lab.unitless")} />
                    </td>
                    <td className="px-3 py-2">
                      {test && flag ? <RefBadge test={test} flag={flag} /> : null}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        aria-label={t("intraop.lab.removeResult")}
                        onClick={() => remove(idx)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setPresetsOpen(open => !open)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          {presetsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {t("intraop.lab.addManually")}
        </button>

        {presetsOpen && (
          <div className="space-y-2 mt-3">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("intraop.lab.search")}
              className="h-7 text-sm w-48 mb-1"
            />

            {filtered ? (
              filtered.length > 0 ? (
                <div className="rounded-lg border border-slate-200 dark:border-[#2e2e2e] overflow-hidden w-full max-w-xl">
                  {filtered.slice(0, 10).map(({ category, test }) => {
                    const added = value.some(row => row.test === test.name)
                    return (
                      <button
                        key={test.name}
                        type="button"
                        onClick={() => addTest(test)}
                        disabled={added}
                        className={`w-full text-left px-3 py-2 border-b last:border-b-0 border-slate-100 dark:border-[#2a2a2a] transition-colors ${
                          added
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400 cursor-default"
                            : "hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
                        }`}
                      >
                        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">{displayClinicalCode("labTest", test.name, locale, { label: test.name })}</span>
                        <span className="block text-[11px] text-slate-400">{displayClinicalCode("labCategory", category.id, locale, { label: category.label })} — {test.unit || t("intraop.lab.unitless")}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400">{t("intraop.lab.noCanonicalMatch")}</p>
              )
            ) : LAB_CATEGORIES.map(category => (
              <div key={category.id} className="flex items-start gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-24 shrink-0 pt-1">
                  {displayClinicalCode("labCategory", category.id, locale, { label: category.label })}
                </span>
                <div className="flex flex-wrap gap-1">
                  {category.tests.map(test => {
                    const added = value.some(row => row.test === test.name)
                    return (
                      <button
                        key={test.name}
                        type="button"
                        onClick={() => addTest(test)}
                        disabled={added}
                        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                          added
                            ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400 cursor-default"
                            : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400"
                        }`}
                      >
                        <Plus className="inline h-3 w-3 mr-1" />
                        {displayClinicalCode("labTest", test.name, locale, { label: test.name })}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
