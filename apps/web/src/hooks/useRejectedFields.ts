"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { readRejectedFields, rejectionsForSection, rejectionMessages } from "@/lib/rejected-fields"

type Section = "preop" | "intraop" | "postop"

export function useRejectedFields() {
  const t = useTranslations()
  const [rejections, setRejections] = useState<Record<string, Map<string, string>>>({})
  const noteRejections = useCallback((section: Section, body: unknown) => {
    try {
      const mine = rejectionsForSection(readRejectedFields(body), section)
      setRejections(previous => {
        const next = rejectionMessages(mine, t("case.notSaved"))
        if (next.size === 0 && !previous[section]) return previous
        return { ...previous, [section]: next }
      })
      return mine.length
    } catch {
      return 0
    }
  }, [t])
  return { rejections, noteRejections }
}
