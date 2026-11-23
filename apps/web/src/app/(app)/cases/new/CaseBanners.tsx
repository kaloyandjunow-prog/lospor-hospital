"use client"

import { WatchingBanner } from "@/components/WatchingBanner"
import { CasePresenceBanner } from "@/components/CasePresenceBanner"

/** What the case page says about the other people on the case: watching (someone holds it) and who has it open (10.8.0). */
export function CaseBanners({ isWatching, holderName, onTakeover, caseId, presence }: {
  isWatching: boolean
  holderName: string | null
  onTakeover: () => void
  caseId: string | null
  presence: boolean
}) {
  return (
    <>
      {isWatching && <WatchingBanner onTakeover={onTakeover} holderName={holderName} />}
      <CasePresenceBanner caseId={caseId} enabled={presence} />
    </>
  )
}
