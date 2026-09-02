import { z } from "zod"

/**
 * The postoperative form contract, beside preopSchema.ts for the same reason:
 * a form schema is a data contract the API also has to honour, and it is
 * easier to keep the two in step when it is not buried in a component.
 */
export const postopSchema = z.object({
  aldreteActivity:      z.coerce.number().min(0).max(2).optional(),
  aldreteRespiration:   z.coerce.number().min(0).max(2).optional(),
  aldreteCirculation:   z.coerce.number().min(0).max(2).optional(),
  aldreteConsciousness: z.coerce.number().min(0).max(2).optional(),
  aldreteSpO2:          z.coerce.number().min(0).max(2).optional(),
  recoveryBpSystolic:  z.coerce.number().nullable().optional(),
  recoveryBpDiastolic: z.coerce.number().nullable().optional(),
  recoveryHeartRate:   z.coerce.number().nullable().optional(),
  recoverySpO2:        z.coerce.number().nullable().optional(),
  painScoreNRS:       z.coerce.number().min(0).max(10).optional(),
  pediatricPainScale: z.enum(["FLACC", "FPS_R", "NRS"]).optional(),
  pediatricPainScore: z.coerce.number().min(0).max(10).optional(),
  // nullable because this one is stepper-backed, and the stepper clears with
  // null. Without it Number(null) === 0 would record PAED 0 — "no emergence
  // delirium", a real finding — for a score nobody assessed. The Aldrete
  // components and the pain scores beside it are button- and slider-backed and
  // can never emit a clear, which is why they are not.
  paedScore:          z.coerce.number().min(0).max(20).nullable().optional(),
  ponv:               z.boolean().nullable().default(null),
  temperatureCelsius: z.coerce.number().nullable().optional(),
  recoveryBpUnobtainable:          z.boolean().default(false),
  recoveryHeartRateUnobtainable:   z.boolean().default(false),
  recoverySpO2Unobtainable:        z.boolean().default(false),
  recoveryTemperatureUnobtainable: z.boolean().default(false),
  disposition:      z.enum(["WARD", "PACU", "ICU"]).optional(),
  dispositionNotes: z.string().optional(),
  handoverItems:    z.array(z.string()).default([]),
})

export type PostopData = z.infer<typeof postopSchema>
