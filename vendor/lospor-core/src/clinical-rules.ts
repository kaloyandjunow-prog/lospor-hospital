/**
 * Clinical rules: the authored layer that decides what a clinician is offered
 * when they reach for a drug, fluid or infusion, and on what basis a dose is
 * calculated.
 *
 * This file is a barrel. It exists so that the four consuming repos can keep
 * importing `@lospor/core/clinical-rules` as one place, while the
 * implementation lives in focused modules under `./clinical-rules/`:
 *
 *   types.ts              rule kinds, payload shapes, DTOs
 *   validation.ts         payload, collection and publication validation
 *   adult-profiles.ts     the LOSPOR adult ruleset and its dose profiles
 *   pediatric-profiles.ts drug / fluid / infusion rule adapters
 *   selection.ts          which profiles apply to this patient, and the
 *                         selection surface that results
 *   option-overlays.ts    applying profiles onto option lists
 *   effective.ts          resolving the PLATFORM / INSTITUTION / USER hierarchy
 *                         into the rules that actually take effect
 *
 * `internal.ts` is deliberately not re-exported: it holds helpers that two or
 * more of the modules above share, and keeping it out of the barrel is what
 * stops `export *` from silently widening the public surface.
 */
export * from "./clinical-rules/types"
export * from "./clinical-rules/validation"
export * from "./clinical-rules/adult-profiles"
export * from "./clinical-rules/pediatric-profiles"
export * from "./clinical-rules/selection"
export * from "./clinical-rules/option-overlays"
export * from "./clinical-rules/effective"
