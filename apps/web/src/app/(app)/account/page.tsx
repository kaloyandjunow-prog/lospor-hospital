import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { AccountPageClient } from "@/components/account/AccountPageClient"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account")
  return { title: `${t("title")} — LOSPOR` }
}

export default function AccountPage() {
  return <AccountPageClient />
}
