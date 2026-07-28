"use client"

import { useLocale } from "./locale-provider"

export function BilingualText({ en, bg }: { en: string; bg: string }) {
  const { locale } = useLocale()
  return <>{locale === "bg" ? bg : en}</>
}
