import { GovernanceWorkspace } from "@/components/governance-workspace"
import { PageHeading } from "@/components/page-heading"

export default function GovernancePage() {
  return (
    <>
      <PageHeading
        title="Research governance"
        titleBg="Изследователско управление"
        description="Grant explicit institutional scope and export permissions to approved researcher accounts."
        descriptionBg="Предоставяйте изричен институционален обхват и права за експорт."
      />
      <GovernanceWorkspace />
    </>
  )
}
