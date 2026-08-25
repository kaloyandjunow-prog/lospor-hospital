"use client"

import Link from "next/link"
import { LanguageSelector, useLocale } from "./locale-provider"

export function LoginCopy() {
  const { message } = useLocale()
  return (
    <>
      <LanguageSelector />
      <h1>{message("loginTitle")}</h1>
      <p>{message("loginSummary")}</p>
      <nav className="login-legal-links" aria-label={message("legalLinksLabel")}>
        <Link href="/terms">{message("termsLink")}</Link>
        <Link href="/privacy">{message("privacyLink")}</Link>
      </nav>
    </>
  )
}

export function LoginContext() {
  const { message } = useLocale()
  return (
    <section className="login-context" aria-hidden="true">
      <div>
        <h2>{message("loginContextTitle")}</h2>
        <p>{message("loginContextDescription")}</p>
      </div>
    </section>
  )
}
