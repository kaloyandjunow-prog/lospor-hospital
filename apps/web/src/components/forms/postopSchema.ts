import { z } from "zod"
import {
  CLINICAL_NUMBER_RULES,
  validatePostopPatch,
} from "@lospor/core/clinical-validation"

/**
 * The postoperative form contract, beside preopSchema.ts for the same reason:
 * a form schema is a data contract the API also has to honour, and it is
 * easier to keep the two in step when it is not buried in a component.
 *
 * Bounds come from core's rule table, which the API validates against too.
 *
 * Every clinical number is nullable, and that is not decoration. `.coerce` is
 * needed because the inputs hand back strings, but `z.coerce.number()` without
 * `.nullable()` runs `Number(null)` and turns a cleared field into `0` --
 * which on an Aldrete component is not "not assessed" but a recorded finding
 * about an unresponsive, apnoeic patient. `.nullable()` short-circuits before
 * the coercion, so a clear stays a clear. Core's CLINICAL_CLEARABLE_FIELDS
 * names every field this applies to and a test here checks the list against
 * this schema.
 */
const postopNumber = (field: string) => {
  const rule = CLINICAL_NUMBER_RULES.postop[field]
  if (!rule) throw new Error(`Missing Core number rule for postop.${field}`)
  return z.coerce.number().min(rule.min).max(rule.max).nullable()
}

export const postopSchema = z.object({
  aldreteActivity:      postopNumber("aldreteActivity").optional(),
  aldreteRespiration:   postopNumber("aldreteRespiration").optional(),
  aldreteCirculation:   postopNumber("aldreteCirculation").optional(),
  aldreteConsciousness: postopNumber("aldreteConsciousness").optional(),
  aldreteSpO2:          postopNumber("aldreteSpO2").optional(),
  stewardConsciousness: postopNumber("stewardConsciousness").optional(),
  stewardAirway:        postopNumber("stewardAirway").optional(),
  stewardMovement:      postopNumber("stewardMovement").optional(),
  recoveryBpSystolic:   postopNumber("recoveryBpSystolic").optional(),
  recoveryBpDiastolic:  postopNumber("recoveryBpDiastolic").optional(),
  recoveryHeartRate:    postopNumber("recoveryHeartRate").optional(),
  recoverySpO2:         postopNumber("recoverySpO2").optional(),
  painScoreNRS:         postopNumber("painScoreNRS").optional(),
  pediatricPainScale:   z.enum(["FLACC", "FPS_R", "NRS"]).optional(),
  pediatricPainScore:   postopNumber("pediatricPainScore").optional(),
  paedScore:            postopNumber("paedScore").optional(),
  // Pain and delirium item by item (10.0.0); the totals are worked out by the API.
  flaccFace:            postopNumber("flaccFace").optional(),
  flaccLegs:            postopNumber("flaccLegs").optional(),
  flaccActivity:        postopNumber("flaccActivity").optional(),
  flaccCry:             postopNumber("flaccCry").optional(),
  flaccConsolability:   postopNumber("flaccConsolability").optional(),
  fpsrScore:            postopNumber("fpsrScore").optional(),
  nipsFacialExpression: postopNumber("nipsFacialExpression").optional(),
  nipsCry:              postopNumber("nipsCry").optional(),
  nipsBreathing:        postopNumber("nipsBreathing").optional(),
  nipsArms:             postopNumber("nipsArms").optional(),
  nipsLegs:             postopNumber("nipsLegs").optional(),
  nipsArousal:          postopNumber("nipsArousal").optional(),
  paedEyeContact:       postopNumber("paedEyeContact").optional(),
  paedPurposeful:       postopNumber("paedPurposeful").optional(),
  paedAware:            postopNumber("paedAware").optional(),
  paedRestless:         postopNumber("paedRestless").optional(),
  paedInconsolable:     postopNumber("paedInconsolable").optional(),
  temperatureCelsius:   postopNumber("temperatureCelsius").optional(),
  // "Not asked" is not "absent". Defaulting to false let autosave record PONV
  // as explicitly ruled out on a patient nobody had asked.
  ponv:                 z.boolean().nullable().default(null),
  recoveryBpUnobtainable:          z.boolean().default(false),
  recoveryHeartRateUnobtainable:   z.boolean().default(false),
  recoverySpO2Unobtainable:        z.boolean().default(false),
  recoveryTemperatureUnobtainable: z.boolean().default(false),
  disposition:      z.enum(["WARD", "PACU", "ICU"]).optional(),
  // The procedure done (10.0.0): filled in with the planned procedures.
  performedProcedures: z.array(z.object({ label: z.string() }).passthrough()).default([]),
  dispositionNotes: z.string().optional(),
  handoverItems:    z.array(z.string()).default([]),
}).superRefine((data, ctx) => {
  // The same server-side rules the API applies, run at the form boundary so a
  // refusal is seen where it can be corrected rather than at save time.
  for (const issue of validatePostopPatch(data).issues) {
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.code })
  }
})

export type PostopData = z.infer<typeof postopSchema>
