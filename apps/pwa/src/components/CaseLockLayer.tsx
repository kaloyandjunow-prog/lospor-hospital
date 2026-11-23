import { CasePresenceBanner } from "@/components/CasePresenceBanner"
import { WatchingOverlay } from "@/components/WatchingOverlay"

/** What a case screen shows about other people: the watching overlay when another device holds the case, and who has it open. */
export function CaseLockLayer({ caseId, isWatching, onTakeover }: { caseId: string; isWatching: boolean; onTakeover: () => Promise<void> }) {
  return (
    <>
      {isWatching && <WatchingOverlay onTakeover={onTakeover} />}
      <CasePresenceBanner caseId={caseId} />
    </>
  )
}
