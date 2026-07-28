import Link from "next/link"
import { currentSession } from "@/lib/api"

export default async function AccessDeniedPage() {
  const session = await currentSession()
  return (
    <main className="login-page">
      <section className="login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="LOSPOR" />
        <h1>Research access required</h1>
        <p>
          {session?.user.name ?? "This account"} can sign in to LOSPOR, but does
          not currently have a Database research role or active access grant.
        </p>
        <div className="notice">
          Ask a LOSPOR administrator to assign the Researcher role and grant the
          required institution scope.
        </div>
        <Link className="button" href="/login">Return to sign in</Link>
      </section>
      <section className="login-context" aria-hidden="true" />
    </main>
  )
}
