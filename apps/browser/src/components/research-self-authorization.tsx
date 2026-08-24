"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Status = {
  eligible: boolean
  activeUntil: string | null
  nextEligibleAt: string
}

type Copy = {
  title: string
  description: string
  limit: string
  checking: string
  activate: string
  activating: string
  next: string
  failed: string
}

export function ResearchSelfAuthorization({
  locale,
  copy,
}: {
  locale: "bg" | "en"
  copy: Copy
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/research/self-authorization", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error("status")
        return response.json() as Promise<Status>
      })
      .then(value => setStatus(value))
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(copy.failed)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [copy.failed])

  async function activate() {
    setActivating(true)
    setError("")
    try {
      const response = await fetch("/api/research/self-authorization", { method: "POST" })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { nextEligibleAt?: string }
        const nextEligibleAt = body.nextEligibleAt
        if (nextEligibleAt) {
          setStatus(current => ({
            eligible: false,
            activeUntil: current?.activeUntil ?? null,
            nextEligibleAt,
          }))
        }
        throw new Error("activation")
      }
      router.replace("/overview")
      router.refresh()
    } catch {
      setError(copy.failed)
    } finally {
      setActivating(false)
    }
  }

  const nextEligible = status && !status.eligible
    ? new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(status.nextEligibleAt))
    : null

  return (
    <section className="notice" aria-labelledby="self-authorization-title">
      <h2 id="self-authorization-title">{copy.title}</h2>
      <p>{copy.description}</p>
      <p>{copy.limit}</p>
      {loading ? <p role="status">{copy.checking}</p> : null}
      {!loading && status?.eligible ? (
        <button className="button" type="button" onClick={activate} disabled={activating}>
          {activating ? copy.activating : copy.activate}
        </button>
      ) : null}
      {nextEligible ? <p>{copy.next}: {nextEligible}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
