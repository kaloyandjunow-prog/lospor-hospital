import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { LoginForm } from "./LoginForm"
import { safeCallbackUrl } from "@/lib/safe-navigation"

type LoginSearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: `${t("signIn")} — LOSPOR` }
}

export default async function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  const query = await searchParams
  return (
    <LoginForm
      callbackUrl={safeCallbackUrl(first(query.callbackUrl))}
      initialErrorCode={first(query.error)}
      registrationNotice={
        first(query.registered) === "check-email" || first(query.registered) === "email-unavailable"
          ? first(query.registered) as "check-email" | "email-unavailable"
          : undefined
      }
      passwordChanged={first(query.passwordChanged) === "1"}
    />
  )
}
