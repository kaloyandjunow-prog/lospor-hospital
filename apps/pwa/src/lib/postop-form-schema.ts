import { z } from "zod"
import {
  CLINICAL_NUMBER_RULES,
  validatePostopPatch,
} from "@lospor/core/clinical-validation"
import { normalizeHandoverCodes } from "@lospor/core/postop"

const postopNumber = (field: string) => {
  const rule = CLINICAL_NUMBER_RULES.postop[field]
  if (!rule) throw new Error(`Missing Core number rule for postop.${field}`)
  return z.number().min(rule.min).max(rule.max)
}

export const postopFormSchema = z.object({
  aldreteActivity: postopNumber("aldreteActivity").default(0),
  aldreteRespiration: postopNumber("aldreteRespiration").default(0),
  aldreteCirculation: postopNumber("aldreteCirculation").default(0),
  aldreteConsciousness: postopNumber("aldreteConsciousness").default(0),
  aldreteSpO2: postopNumber("aldreteSpO2").default(0),
  recoveryBpSystolic: postopNumber("recoveryBpSystolic").optional(),
  recoveryBpDiastolic: postopNumber("recoveryBpDiastolic").optional(),
  recoveryHeartRate: postopNumber("recoveryHeartRate").optional(),
  recoverySpO2: postopNumber("recoverySpO2").optional(),
  temperatureCelsius: postopNumber("temperatureCelsius").optional(),
  painScoreNRS: postopNumber("painScoreNRS").optional(),
  ponv: z.boolean().default(false),
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
