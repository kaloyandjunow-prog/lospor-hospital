"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { setAccountLocale } from "@/app/actions/locale"
import { parseLocale } from "@/i18n/locales"

export function AccountLocaleSync({
  accountLocale,
  currentLocale,
}: {
  accountLocale?: string
  currentLocale: string
}) {
  const router = useRouter()

  useEffect(() => {
    const next = parseLocale(accountLocale)
    if (!next || next === currentLocale) return
    void setAccountLocale(next).then(() => router.refresh())
  }, [accountLocale, currentLocale, router])

  return null
}

