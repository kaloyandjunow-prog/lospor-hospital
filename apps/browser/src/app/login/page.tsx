import { redirect } from "next/navigation"
import { currentSession } from "@/lib/api"
import { LoginForm } from "@/components/login-form"
import { LoginCopy } from "@/components/login-copy"


export default async function LoginPage() {
  if (await currentSession()) redirect("/overview")
  return (
    <main className="login-page">
      <section className="login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="LOSPOR" />
        <LoginCopy />
        <LoginForm />
      </section>
      <section className="login-context" aria-hidden="true">
        <div>
          <h2>From clinical record to usable evidence.</h2>
          <p>
            Build governed cohorts, inspect data quality, compare outcomes, and
            create complete research exports without exposing operational tables.
          </p>
        </div>
      </section>
    </main>
  )
}
