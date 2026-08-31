/**
 * Resolves the case id an AI route needs, saving the draft first if necessary.
 *
 * Every AI route is case-scoped, because the server reads consent from the
 * stored case rather than trusting the caller: a lab report photograph carries
 * the patient's name and EGN, no redaction is possible on an image, and an
 * attestation the server never checks is not a consent control. So there must be
 * a saved case, with the current `aiOptIn` already persisted, before any image
 * or summary is sent.
 *
 * Two paths, both of which the advisor established before lab scanning reused
 * them: with no case yet, create one from the current form values, which carry
 * `aiOptIn` and so cannot race; with a case already saved, wait for any autosave
 * still in flight, so a consent tick made moments ago is in the database before
 * the server is asked about it.
 *
 * Lives outside the new-case screen so both AI callers share one implementation
 * — the screen is at its size budget, and two copies of a consent-ordering rule
 * is exactly how they drift apart.
 */
export async function ensureSavedCaseForAi(deps: {
  caseIdRef: { current: string | null }
  autosaveInFlightRef: { current: Promise<void> | null }
  createCase: () => Promise<unknown>
}): Promise<string | null> {
  if (!deps.caseIdRef.current) {
    if (!(await deps.createCase())) return null
  } else if (deps.autosaveInFlightRef.current) {
    await deps.autosaveInFlightRef.current
  }
  return deps.caseIdRef.current
}
