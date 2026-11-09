"use client"

import { useEffect, useLayoutEffect } from "react"
import { useRouter } from "next/navigation"
import { setAccountLocale } from "@/app/actions/locale"
import { parseLocale } from "@/i18n/locales"
import { setIdbClinicalOwner } from "@/lib/kv-idb"
import { setWebClinicalPreferencesOwner } from "@/lib/clinical-preferences-web"

export function AccountLocaleSync({
  accountLocale,
  currentLocale,
  accountId,
}: {
  accountLocale?: string
  currentLocale: string
  accountId: string
}) {
  const router = useRouter()

  // Establish the storage scope before the app-wide outbox flusher's passive
  // effect can run.  Old account data remains in IndexedDB but is invisible to
  // this account; explicit sign-out still clears the active account's queue.
  useLayoutEffect(() => {
    setIdbClinicalOwner(accountId)
    setWebClinicalPreferencesOwner(accountId)
  }, [accountId])

  useEffect(() => {
    const next = parseLocale(accountLocale)
    if (!next || next === currentLocale) return
    void setAccountLocale(next).then(() => router.refresh())
  }, [accountLocale, currentLocale, router])

  return null
}

