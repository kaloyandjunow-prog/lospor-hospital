import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ResetPasswordForm } from "./ResetPasswordForm"

type ResetSearchParams = Promise<Record<string, string | string[] | undefined>>

function tokenFrom(value: string | string[] | undefined) {
  const token = Array.isArray(value) ? value[0] : value
  return typeof token === "string" && token.length <= 4_096 ? token : ""
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: `${t("resetPasswordTitle")} — LOSPOR` }
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: ResetSearchParams }) {
  const query = await searchParams
  return <ResetPasswordForm token={tokenFrom(query.token)} />
}
