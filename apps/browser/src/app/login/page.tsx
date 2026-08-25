import { redirect } from "next/navigation"
import { currentSession } from "@/lib/api"
import { LoginForm } from "@/components/login-form"
import { LoginContext, LoginCopy } from "@/components/login-copy"
import { safeResearchCallback } from "@/lib/safe-navigation"

type LoginSearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  const [session, query] = await Promise.all([
    currentSession(),
    searchParams,
  ])
  const callbackUrl = safeResearchCallback(first(query.callbackUrl))
  if (session) redirect(callbackUrl)
  return (
    <main className="login-page">
      <section className="login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="LOSPOR" />
        <LoginCopy />
        <LoginForm callbackUrl={callbackUrl} />
      </section>
      <LoginContext />
    </main>
  )
}
