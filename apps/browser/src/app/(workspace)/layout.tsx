import { redirect } from "next/navigation"
import type { ResearchMetadata } from "@lospor/core/research"
import { WorkspaceShell } from "@/components/workspace-shell"
import { apiServerFetch, currentSession } from "@/lib/api"
import { messages } from "@/lib/i18n"
import { currentLocale } from "@/lib/server-locale"

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [session, locale] = await Promise.all([currentSession(), currentLocale()])
  if (!session?.user) redirect("/login")
  const response = await apiServerFetch("/v1/research/metadata")
  if (response.status === 403) redirect("/access-denied")
  if (!response.ok) throw new Error(messages[locale].researchApiUnavailable)
  const metadata = await response.json() as ResearchMetadata
  return (
    <WorkspaceShell user={session.user} metadata={metadata}>
      {children}
    </WorkspaceShell>
  )
}
