/**
 * The platform's own clinical rule drafts, as seeded baselines.
 *
 * The adult and pediatric seed sets are large, almost entirely declarative,
 * and share nothing but a type, so they live in ./platform-drafts/ as one
 * module each. This file stays the import path every consumer already uses --
 * @lospor/core/platform-clinical-drafts and the package barrel both point
 * here -- so splitting the seeds moved no call sites.
 */
export {
  LOSPOR_PEDIATRIC_RULESET_KEY,
  LOSPOR_PEDIATRIC_RULESET_NAME,
  LOSPOR_PEDIATRIC_RULESET_VERSION,
  LOSPOR_PEDIATRIC_V2_RULESET_VERSION,
  LOSPOR_ADULT_V2_RULESET_VERSION,
  PEDIATRIC_MAX_AGE_DAYS_EXCLUSIVE,
  clinicalDraftRuleKeys,
  type ClinicalRuleSeed,
  type PlatformClinicalDraft,
} from "./platform-drafts/types"

export {
  createLosporPediatricPlatformDraft,
  createLosporPediatricV2Draft,
} from "./platform-drafts/pediatric"

export { createLosporAdultV2Draft } from "./platform-drafts/adult"
