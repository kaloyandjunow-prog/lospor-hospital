"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { LanguageSelector, useLocale } from "./locale-provider"

type LegalKind = "TERMS" | "PRIVACY"
type LegalSection = {
  title: string
  paragraphs?: string[]
  warning?: string
  bullets?: Array<{ label?: string; text: string }>
}
type LegalContent = { title: string; sections: LegalSection[] }
type LegalDescriptor = {
  deployment: string
  kind: LegalKind
  version: string
  effectiveDate: string
  locale: "bg" | "en"
  content: string
  contentSha256: string
}

function parseContent(value: string): LegalContent | null {
  try {
    const parsed = JSON.parse(value) as Partial<LegalContent>
    if (typeof parsed.title !== "string" || !Array.isArray(parsed.sections)) return null
    if (!parsed.sections.every(section =>
      section
      && typeof section.title === "string"
      && (section.paragraphs === undefined || (
        Array.isArray(section.paragraphs)
        && section.paragraphs.every(paragraph => typeof paragraph === "string")
      ))
      && (section.warning === undefined || typeof section.warning === "string")
      && (section.bullets === undefined || (
        Array.isArray(section.bullets)
        && section.bullets.every(item => item && typeof item.text === "string")
      )),
    )) return null
    return parsed as LegalContent
  } catch {
    return null
  }
}

export function LegalDocument({ kind }: { kind: LegalKind }) {
  const { locale, message } = useLocale()
  const requestKey = `${kind}:${locale}`
  const [loaded, setLoaded] = useState<{
    key: string | null
    document: LegalDescriptor | null
    failed: boolean
  }>({ key: null, document: null, failed: false })

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/legal/documents?locale=${locale}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error("legal")
        return response.json() as Promise<{ documents?: LegalDescriptor[] }>
      })
      .then(body => {
        const selected = body.documents?.find(candidate =>
          candidate.kind === kind && candidate.locale === locale)
        if (!selected || !parseContent(selected.content)) throw new Error("legal")
        setLoaded({ key: requestKey, document: selected, failed: false })
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setLoaded({ key: requestKey, document: null, failed: true })
        }
      })
    return () => controller.abort()
  }, [kind, locale, requestKey])

  const pending = loaded.key !== requestKey
  const document = pending ? null : loaded.document
  const failed = !pending && loaded.failed
  const content = !pending && document ? parseContent(document.content) : null
  const effectiveDate = document && !pending
    ? new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${document.effectiveDate}T00:00:00.000Z`))
    : null

  return (
    <main className="legal-page">
      <article className="legal-document">
        <header>
          <div className="legal-brand">
            <Link className="mono" href="/login">LOSPOR</Link>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/periop-laboratories-logo.png" alt="PeriOp Laboratories" className="legal-publisher-logo" />
            <span className="legal-publisher-label">{message("legalPublisher")}</span>
          </div>
          <LanguageSelector />
        </header>
        {pending ? <p role="status">{message("legalLoading")}</p> : null}
        {failed ? <div className="notice error" role="alert">{message("legalUnavailable")}</div> : null}
        {content && document && effectiveDate ? (
          <>
            <h1>{content.title}</h1>
            <dl className="legal-metadata">
              <dt>{message("legalEffectiveDate")}</dt><dd>{effectiveDate}</dd>
              <dt>{message("legalVersion")}</dt><dd>{document.version}</dd>
              <dt>{message("legalDeployment")}</dt><dd>{document.deployment}</dd>
              <dt>{message("legalContentHash")}</dt><dd className="mono">{document.contentSha256}</dd>
            </dl>
            <div className="legal-sections">
              {content.sections.map(section => (
                <section key={section.title}>
                  <h2>{section.title}</h2>
                  {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                  {section.warning ? <p className="notice">{section.warning}</p> : null}
                  {section.bullets ? (
                    <ul>
                      {section.bullets.map(item => (
                        <li key={`${item.label ?? ""}:${item.text}`}>
                          {item.label ? <><strong>{item.label}:</strong>{" "}</> : null}
                          {item.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>
          </>
        ) : null}
        <footer>
          <Link href={kind === "TERMS" ? "/privacy" : "/terms"}>
            {kind === "TERMS" ? message("privacyLink") : message("termsLink")}
          </Link>
          <span aria-hidden="true"> · </span>
          <Link href="/login">{message("returnToSignIn")}</Link>
        </footer>
      </article>
    </main>
  )
}
