import { redirect } from "next/navigation"
import type { ResearchMetadata } from "@lospor/core/research"
import { WorkspaceShell } from "@/components/workspace-shell"
import { apiServerFetch, currentSession } from "@/lib/api"

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession()
  if (!session?.user) redirect("/login")
  const response = await apiServerFetch("/v1/research/metadata")
  if (response.status === 403) redirect("/access-denied")
  if (!response.ok) throw new Error("Research API is unavailable")
  const metadata = await response.json() as ResearchMetadata
  return (
    <WorkspaceShell user={session.user} metadata={metadata}>
      {children}
    </WorkspaceShell>
  )
}
