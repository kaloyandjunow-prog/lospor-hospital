"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { setAccountLocale } from "@/app/actions/locale"
import { persistAccountLocale } from "@/lib/account-locale"
import { DEFAULT_LOCALE, parseLocale } from "@/i18n/locales"

export function useAccountLocale(initialLocale: unknown) {
  const router = useRouter()
  const t = useTranslations("locale")
  const [locale, setLocale] = useState(parseLocale(initialLocale) ?? DEFAULT_LOCALE)
  const [, startTransition] = useTransition()

  async function switchLocale(value: string) {
    const nextLocale = parseLocale(value)
    if (!nextLocale) return
    const previous = locale
    setLocale(nextLocale)
    if (!await persistAccountLocale(nextLocale)) {
      setLocale(previous)
      toast.error(t("accountSyncFailed"))
      return
    }
    await setAccountLocale(nextLocale)
    startTransition(() => router.refresh())
  }

  return { locale, switchLocale }
}
