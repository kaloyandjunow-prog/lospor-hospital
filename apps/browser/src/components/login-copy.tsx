"use client"

import { LanguageSelector, useLocale } from "./locale-provider"

export function LoginCopy() {
  const { locale } = useLocale()
  return (
    <>
      <LanguageSelector />
      <h1>{locale === "bg" ? "LOSPOR База данни" : "LOSPOR Database"}</h1>
      <p>
        {locale === "bg"
          ? "Изследователски анализ, подобряване на качеството и сравнение на периоперативни резултати."
          : "Research analysis, quality improvement, and benchmarking for perioperative care."}
      </p>
    </>
  )
}
