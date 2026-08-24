import type { PasswordPolicyIssue } from "@lospor/core/account"

export type AccountProfile = {
  id: string
  email: string
  name: string
  firstName: string
  lastName: string
  title: string
  role: string
  institution?: { id: string; name: string; city: string } | null
}

export type AccountSession = {
  id: string
  clientType: string
  deviceLabel: string | null
  issuedAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}

export const POLICY_KEYS: Record<PasswordPolicyIssue, string> = {
  too_short: "account.passwordPolicy.tooShort",
  missing_uppercase: "account.passwordPolicy.uppercase",
  missing_number: "account.passwordPolicy.number",
  missing_special: "account.passwordPolicy.special",
}

export function formatAccountDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function AccountStatusMessage({ kind, children }: {
  kind: "error" | "success"
  children: React.ReactNode
}) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={kind === "error"
        ? "text-sm text-red-600 dark:text-red-400"
        : "text-sm text-green-700 dark:text-green-400"}
    >
      {children}
    </p>
  )
}

export async function fetchAccountData() {
  const [profileResponse, sessionsResponse] = await Promise.all([
    fetch("/api/user", { cache: "no-store" }),
    fetch("/api/user/sessions", { cache: "no-store" }),
  ])
  if (!profileResponse.ok || !sessionsResponse.ok) throw new Error("account unavailable")
  const [profile, sessionsBody] = await Promise.all([
    profileResponse.json() as Promise<AccountProfile>,
    sessionsResponse.json() as Promise<{ sessions?: AccountSession[] }>,
  ])
  return { profile, sessions: sessionsBody.sessions ?? [] }
}
