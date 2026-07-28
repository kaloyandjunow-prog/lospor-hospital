"use client"

import { LanguageButton, useLocale } from "./locale-provider"

export function LoginCopy() {
  const { locale } = useLocale()
  return (
    <>
      <div style={{ position: "absolute", top: 18, right: 18 }}>
        <LanguageButton />
      </div>
      <h1>{locale === "bg" ? "LOSPOR База данни" : "LOSPOR Database"}</h1>
      <p>
        {locale === "bg"
          ? "Изследователски анализ, подобряване на качеството и сравнение на периоперативни резултати."
          : "Research analysis, quality improvement, and benchmarking for perioperative care."}
      </p>
    </>
  )
}
