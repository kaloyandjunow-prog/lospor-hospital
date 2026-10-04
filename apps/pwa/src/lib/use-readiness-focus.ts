import { useEffect, useRef, type RefObject } from "react"
import type { PreopSection as CorePreopSection } from "@lospor/core/clinical-validation"
import type { PreopSection } from "@/lib/preop-form-schema"

/** Core's preoperative section names, as this screen calls its sections. */
const SCREEN_SECTION: Record<CorePreopSection, PreopSection> = {
  demographics: "patient",
  case_details: "case",
  medical_history: "history",
  current_medications: "meds",
  anamnesis: "anamnesis",
  physical_exam: "exam",
  airway: "airway",
  labs: "labs",
  risk_scores: "risk",
}

export function screenSectionFor(focus: string | null | undefined): PreopSection | null {
  return focus && focus in SCREEN_SECTION ? SCREEN_SECTION[focus as CorePreopSection] : null
}

/**
 * Open the section a readiness "Go to" named, once the case is on screen
 * (1.5.0).
 *
 * Waits for the reopened case to load first: jumping into an empty form would
 * land on the right section and then have the server copy reset under it.
 * Once only; after that the clinician drives.
 */
export function useReadinessFocus(
  focus: string | null | undefined,
  loadedRef: RefObject<boolean>,
  jumpTo: (section: PreopSection) => void,
): void {
  // The latest jumpTo, read when the jump happens: the screen recreates it on
  // every render, and listing it would restart the wait each time.
  const jumpRef = useRef(jumpTo)
  useEffect(() => { jumpRef.current = jumpTo })

  useEffect(() => {
    const section = screenSectionFor(focus)
    if (!section) return
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      if (loadedRef.current || tries > 50) {
        clearInterval(timer)
        setTimeout(() => jumpRef.current(section), 250)
      }
    }, 100)
    return () => clearInterval(timer)
  }, [focus, loadedRef])
}
