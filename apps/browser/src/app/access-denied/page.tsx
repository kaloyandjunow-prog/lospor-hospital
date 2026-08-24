import Link from "next/link"
import { ResearchSelfAuthorization } from "@/components/research-self-authorization"
import { currentSession } from "@/lib/api"
import { messages } from "@/lib/i18n"
import { currentLocale } from "@/lib/server-locale"

export default async function AccessDeniedPage() {
  const [session, locale] = await Promise.all([currentSession(), currentLocale()])
  const message = messages[locale]
  const canSelfAuthorize = session?.user.accountKind === "CLINICAL"
    && ["MEMBER", "HEAD_OF_DEPT"].includes(session.user.role)
    && !!session.user.institutionId
  return (
    <main className="login-page">
      <section className="login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="LOSPOR" />
        <h1>{message.accessRequired}</h1>
        <p>
          {session?.user.name ?? message.accessAccountFallback} {message.accessDeniedExplanation}
        </p>
        <div className="notice">{message.accessDeniedHelp}</div>
        {canSelfAuthorize ? (
          <ResearchSelfAuthorization
            locale={locale}
            copy={{
              title: message.selfAccessTitle,
              description: message.selfAccessDescription,
              limit: message.selfAccessLimit,
              checking: message.selfAccessChecking,
              activate: message.selfAccessActivate,
              activating: message.selfAccessActivating,
              next: message.selfAccessNext,
              failed: message.selfAccessFailed,
            }}
          />
        ) : null}
        <Link className="button" href="/login">{message.returnToSignIn}</Link>
      </section>
      <section className="login-context" aria-hidden="true" />
    </main>
  )
}
