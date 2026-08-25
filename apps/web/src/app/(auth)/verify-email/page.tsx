import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type VerifySearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata(): Promise<Metadata> {
  const metadataTranslations = await getTranslations("auth")
  return { title: `${metadataTranslations("verifyEmailTitle")} — LOSPOR` }
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: VerifySearchParams }) {
  const query = await searchParams
  const token = first(query.token)
  if (token && token.length <= 4_096) {
    const encoded = new URLSearchParams({ token })
    redirect(`/api/auth/verify-email?${encoded.toString()}`)
  }

  const verified = first(query.status) === "verified"
  const translations = await getTranslations()

  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>{translations("auth.verifyEmailTitle")}</CardTitle>
          <CardDescription>
            {verified ? translations("auth.verifyEmailMemberReady") : translations("auth.verifyEmailInvalid")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link
            href="/login"
            className="flex h-8 w-full items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {translations("auth.signIn")}
          </Link>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
