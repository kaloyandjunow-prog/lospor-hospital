"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import {
  backToProcedureGroup,
  chooseExactOperation,
  importedProcedureOf,
  isExactProcedure,
  procedureGroupOf,
  suggestedProcedureCodes,
} from "@lospor/core/procedure-codes"
import type { Tag } from "@/components/TagInput"

type CodeRow = { code: string; description: string; domain: string | null; suggested?: boolean }
type CodeList = { total: number; codes: CodeRow[] }

interface Props {
  value: Tag[]
  onChange: (tags: Tag[]) => void
  disabled?: boolean
}

/**
 * The optional second step of a planned procedure: the exact operation.
 *
 * A group ("Cholecystectomy") is what a clinician searches for, but it holds
 * several operations -- laparoscopic or open, whole or partial -- and only the
 * one actually planned is a research code. So each chosen group offers its
 * ICD-10-PCS operations here, narrowed by typing, and picking one replaces the
 * group tag with the exact one. Leaving it is always allowed.
 */
export function ProcedureOperationPicker({ value, onChange, disabled }: Props) {
  const t = useTranslations("preop")
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const procedures = (value ?? []).filter(tag => procedureGroupOf(tag))
  if (procedures.length === 0) return null

  const replace = (index: number, next: Tag) =>
    onChange((value ?? []).map((tag, i) => (i === index ? next : tag)))

  return (
    <div className="space-y-1.5">
      {(value ?? []).map((tag, index) => {
        const group = procedureGroupOf(tag)
        if (!group) return null
        const exact = isExactProcedure(tag)
        const imported = importedProcedureOf(tag)
        return (
          <div key={`${tag.label}-${index}`} className="rounded-md border border-slate-200 dark:border-[#2e2e2e] px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-700 dark:text-[#e5e5e5]">{group}</span>
              {exact
                ? <span className="text-slate-500 dark:text-[#aaa]">{tag.code} · {tag.description}</span>
                : <span className="text-slate-400 dark:text-[#888]">{t("procedureNoExact")}</span>}
              {imported && (
                <span className="text-slate-400 dark:text-[#888]">
                  {t("procedureFromHospital")}: {[imported.code, imported.sourceLabel].filter(Boolean).join(" · ")}
                </span>
              )}
              {!disabled && (
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    className="text-blue-600 hover:underline"
                    onClick={() => setOpenGroup(openGroup === `${index}` ? null : `${index}`)}
                  >
                    {exact ? t("procedureChangeExact") : t("procedureSpecifyExact")}
                  </button>
                  {exact && (
                    <button
                      type="button"
                      className="text-slate-500 hover:underline"
                      onClick={() => {
                        replace(index, backToProcedureGroup(tag) as Tag)
                        setOpenGroup(null)
                      }}
                    >
                      {t("procedureGroupOnly")}
                    </button>
                  )}
                </span>
              )}
            </div>
            {openGroup === `${index}` && (
              <OperationList
                group={group}
                selected={exact ? tag.code ?? null : null}
                suggested={suggestedProcedureCodes(tag)}
                onPick={row => {
                  replace(index, chooseExactOperation(tag, { ...row, group, domain: row.domain ?? "" }) as Tag)
                  setOpenGroup(null)
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function OperationList({ group, selected, suggested, onPick }: {
  group: string
  selected: string | null
  suggested: string[]
  onPick: (row: CodeRow) => void
}) {
  const t = useTranslations("preop")
  const [query, setQuery] = useState("")
  const [list, setList] = useState<CodeList | null>(null)
  const [failed, setFailed] = useState(false)
  const suggestedKey = suggested.join(",")

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const hint = suggestedKey ? `&suggested=${encodeURIComponent(suggestedKey)}` : ""
        const response = await fetch(`/api/search/procedures/codes?group=${encodeURIComponent(group)}&q=${encodeURIComponent(query)}${hint}`)
        if (!response.ok) throw new Error(String(response.status))
        const body = await response.json() as CodeList
        if (!cancelled) { setList(body); setFailed(false) }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }, query ? 150 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [group, query, suggestedKey])

  return (
    <div className="mt-2 space-y-1.5">
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={t("procedureExactFilter")}
        aria-label={t("procedureExactFilter")}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
      />
      {failed && <p className="text-amber-600">{t("procedureExactUnavailable")}</p>}
      {list && list.total === 0 && <p className="text-slate-400">{t("procedureExactNone")}</p>}
      {list && list.total > list.codes.length && (
        <p className="text-slate-400">{t("procedureExactMore", { shown: list.codes.length, total: list.total })}</p>
      )}
      {list && list.codes.length > 0 && (
        <ul role="listbox" aria-label={group} className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2a2a2a]">
          {list.codes.map(row => (
            <li key={row.code}>
              <button
                type="button"
                role="option"
                aria-selected={row.code === selected}
                onClick={() => onPick(row)}
                className={`w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] ${row.code === selected ? "bg-blue-50 dark:bg-blue-900/40" : ""}`}
              >
                <span className="font-mono text-slate-500 mr-2">{row.code}</span>
                <span className="text-slate-800 dark:text-[#e5e5e5]">{row.description}</span>
                {row.suggested && <span className="ml-2 rounded bg-emerald-50 px-1 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{t("procedureSuggested")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
