import { z } from "zod"
import {
  CLINICAL_NUMBER_RULES,
  validatePostopPatch,
} from "@lospor/core/clinical-validation"
import { normalizeHandoverCodes } from "@lospor/core/postop"

/**
 * Bounds from core's rule table, which the API validates against too.
 *
 * Nullable throughout: `null` is how a clinician takes an answer back, and it
 * is the only spelling that survives into a patch -- `undefined` is dropped, so
 * a score entered by mistake could be recorded but never cleared. Core's
 * CLINICAL_CLEARABLE_FIELDS names every field this applies to, and a test here
 * checks the list against this schema.
 *
 * No defaults, for the same reason as before: zero on every Aldrete component
 * describes an unresponsive, apnoeic patient, and defaulting to it let autosave
 * document that assessment on someone nobody had looked at.
 */
const postopNumber = (field: string) => {
  const rule = CLINICAL_NUMBER_RULES.postop[field]
  if (!rule) throw new Error(`Missing Core number rule for postop.${field}`)
  return z.number().min(rule.min).max(rule.max).nullable()
}

export const postopFormSchema = z.object({
  aldreteActivity: postopNumber("aldreteActivity").optional(),
  aldreteRespiration: postopNumber("aldreteRespiration").optional(),
  aldreteCirculation: postopNumber("aldreteCirculation").optional(),
  aldreteConsciousness: postopNumber("aldreteConsciousness").optional(),
  aldreteSpO2: postopNumber("aldreteSpO2").optional(),
  recoveryBpSystolic: postopNumber("recoveryBpSystolic").optional(),
  recoveryBpDiastolic: postopNumber("recoveryBpDiastolic").optional(),
  pediatricPainScale: z.enum(["FLACC", "FPS_R", "NRS"]).optional(),
  pediatricPainScore: postopNumber("pediatricPainScore").optional(),
  paedScore: postopNumber("paedScore").optional(),
  recoveryHeartRate: postopNumber("recoveryHeartRate").optional(),
  recoverySpO2: postopNumber("recoverySpO2").optional(),
  temperatureCelsius: postopNumber("temperatureCelsius").optional(),
  painScoreNRS: postopNumber("painScoreNRS").optional(),
  // "Not asked" is not "absent". Defaulting to false let autosave record PONV
  // as explicitly ruled out on a patient nobody had asked.
  ponv: z.boolean().nullable().default(null),
  recoveryBpUnobtainable: z.boolean().default(false),
  recoveryHeartRateUnobtainable: z.boolean().default(false),
  recoverySpO2Unobtainable: z.boolean().default(false),
  recoveryTemperatureUnobtainable: z.boolean().default(false),
  disposition: z.enum(["WARD", "PACU", "ICU"]).optional(),
  dispositionNotes: z.string().optional(),
  handoverItems: z.array(z.string()).default([]),
}).superRefine((data, ctx) => {
  for (const issue of validatePostopPatch(data).issues) {
    ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.code,
    })
  }
})

export type PostopFormInput = z.input<typeof postopFormSchema>
export type PostopFormData = z.output<typeof postopFormSchema>

export const normaliseHandoverCodes = normalizeHandoverCodes
