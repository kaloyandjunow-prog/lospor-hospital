import { useEffect, useRef } from "react"
import type { useRouter } from "next/navigation"

/**
 * Keeps ?step= in the URL so a refresh lands on the right step, and the flag
 * that holds it off while a case loads (9.12.1).
 *
 * The load sets the case before, and the step after, awaiting the outboxes.
 * Without the hold this ran in between with step 0, the URL change reloaded
 * the case, that load put step 1 back, and the page flipped between the two
 * about every 80 ms -- remounting both forms, reloading and saving each time.
 * The hold is a ref, not the loading state: finishing a load must not itself
 * replace the URL, or that replace would start the next load.
 */
export function useStepUrlSync(caseId: string | null, step: number, router: ReturnType<typeof useRouter>) {
  const caseLoadingRef = useRef(false)
  useEffect(() => {
    if (!caseId || caseLoadingRef.current) return
    router.replace(`/cases/new?continue=${caseId}&step=${step}`, { scroll: false })
  }, [step, caseId, router])
  return caseLoadingRef
}
