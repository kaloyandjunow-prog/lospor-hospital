import { z } from "zod"
import { CLINICAL_NUMBER_RULES } from "@lospor/core/clinical-validation"
import type { TimetableData } from "@/components/IntraopTimetable"

/**
 * The intraoperative form contract, beside preopSchema.ts and postopSchema.ts
 * for the same reason: a form schema is a data contract the API also has to
 * honour, and it is easier to keep the two in step when it is not buried in a
 * nine-hundred-line component.
 */
// Bounds from core's rule table, as preopSchema and postopSchema do. Each field
// adds `.nullable()`, without which `.coerce` turns a clear into a recorded 0.
const intraopNumber = (field: string) => {
  const rule = CLINICAL_NUMBER_RULES.intraop[field]
  if (!rule) throw new Error(`Missing Core number rule for intraop.${field}`)
  return z.coerce.number().min(rule.min).max(rule.max)
}

const vitalsRowSchema = z.object({
  time:      z.string().optional(),
  systolic:  z.coerce.number().nullable().optional(),
  diastolic: z.coerce.number().nullable().optional(),
  heartRate: z.coerce.number().nullable().optional(),
  spO2:      z.coerce.number().nullable().optional(),
  etco2:     z.coerce.number().nullable().optional(),
  temp:      z.coerce.number().nullable().optional(),
  // The monitors that read a number, timed like every other vital here.
  bis:       intraopNumber("bisValue").nullable().optional(),
  tofRatio:  intraopNumber("tofRatio").nullable().optional(),
  // Always mmHg; the entry control converts if the clinician works in cmH2O.
  cvp:       intraopNumber("cvpMmHg").nullable().optional(),
  note:      z.string().optional(),
})

const drugSchema = z.object({
  name:  z.string().min(1),
  dose:  z.string(),
  unit:  z.string().default("mg"),
  route: z.string().default("IV"),
  time:  z.string().optional(),
})

export const schema = z.object({
  monthYear:      z.string().optional(),
  startTime:      z.string().optional(),
  endTime:        z.string().optional(),
  endTimeNextDay: z.boolean().default(false),
  startedAt:      z.string().nullable().optional(),
  endedAt:        z.string().nullable().optional(),
  timezone:       z.string().nullable().optional(),

  positions: z.array(z.string()).catch([]).default([]),

  techniques:      z.array(z.string()).catch([]).default([]),
  airwayDevices:   z.array(z.string()).catch([]).default([]),
  // Why this case has no airway device of its own. Both were useState here and
  // nowhere else: they relaxed the finalisation gate and were then thrown away,
  // so the saved record showed no airway device and no reason for it.
  presentsIntubated:   z.boolean().catch(false).default(false),
  airwayNotApplicable: z.boolean().catch(false).default(false),
  tubeSize:        intraopNumber("tubeSize").nullable().optional(),
  cuffed:          z.boolean().optional(),
  lmaSize:         intraopNumber("lmaSize").nullable().optional(),
  oralTubeSize:    intraopNumber("oralTubeSize").nullable().optional(),
  oralCuffed:      z.boolean().optional(),
  nasalTubeSize:   intraopNumber("nasalTubeSize").nullable().optional(),
  nasalCuffed:     z.boolean().optional(),
  peepCmH2O:       intraopNumber("peepCmH2O").nullable().optional(),
  ventilationModes:z.array(z.string()).catch([]).default([]),
  airwayTools:     z.array(z.string()).catch([]).default([]),
  airwayNotes:     z.string().optional(),
  cormackLehane:   z.enum(["I","IIa","IIb","III","IV"]).optional(),
  dltType:         z.string().optional(),
  dltSide:         z.string().optional(),
  dltSize:         intraopNumber("dltSize").nullable().optional(),
  endobronchialSize: intraopNumber("endobronchialSize").nullable().optional(),

  volatileAgent:   z.enum(["SEVOFLURANE","DESFLURANE","ISOFLURANE"]).optional(),

  ecg: z.boolean().default(true), spO2Monitor: z.boolean().default(true),
  nbpMonitor: z.boolean().default(true),
  etco2Monitor: z.boolean().default(false), tempMonitor: z.boolean().default(false),
  invasiveBP: z.boolean().default(false), cvpMonitor: z.boolean().default(false),
  paCatheter: z.boolean().default(false), tee: z.boolean().default(false),
  bis: z.boolean().default(false), entropyMonitor: z.boolean().default(false),
  nirsMonitor: z.boolean().default(false), evokedPotentials: z.boolean().default(false),
  tofMonitor: z.boolean().default(false),
  urinaryCatheter: z.boolean().default(false), stomachTube: z.boolean().default(false),
  neuroMonitor: z.boolean().default(false),
  vascularAccesses: z.array(z.object({ site: z.string(), siteLabel: z.string(), sizeUnit: z.string(), size: z.string(), depthCm: z.string() }).passthrough()).catch([]).default([]),

  premedicationEvening: z.string().optional(),
  premedicationMorning: z.string().optional(),

  drugsAdministered: z.array(drugSchema).default([]),
  vitals:            z.array(vitalsRowSchema).default([]),

  crystalloidsMl:    intraopNumber("crystalloidsMl").nullable().optional(),
  colloidsMl:        intraopNumber("colloidsMl").nullable().optional(),
  bloodMl:           intraopNumber("bloodMl").nullable().optional(),
  urineMl:           intraopNumber("urineMl").nullable().optional(),
  // nullable, not merely optional — the same reason ageYears is. Blood loss is
  // clinician-entered, and "not recorded" must stay distinct from a recorded
  // 0 mL, so an explicit clear has to survive as null into the patch rather
  // than becoming undefined (dropped, stored value kept) or 0 (a measurement
  // nobody made).
  bloodLossMl:       intraopNumber("bloodLossMl").nullable().optional(),

  // Laboratory draws taken during the case. The same shape preop holds, and
  // for the same reason -- a result is a result; only when it was drawn
  // differs. Each entry carries its own takenAt, which is what makes two
  // haemoglobins an hour apart a trend rather than one that looks corrected.
  labResults: z.array(z.object({
    test:  z.string(),
    value: z.string(),
    unit:  z.string().optional(),
    source: z.enum(["manual", "ai-scan", "import"]).optional(),
    takenAt: z.string().optional(),
  }).passthrough()).catch([]).default([]),

  complications: z.string().optional(),
})

// IntraopFormFields is the exact shape useForm<T>() is parameterized with —
// every field react-hook-form actually registers/validates. IntraopData adds
// timetableData on top for onSubmit/onAutoSave payloads only: the timetable
// is its own separate component state (see `timetable`/`setTimetable` below),
// attached via spread at the call sites, never a registered RHF field. Mixing
// the two into one type previously broke RHF's resolver/Control generics.
export type IntraopFormFields = z.infer<typeof schema>
export type IntraopData = IntraopFormFields & { timetableData?: TimetableData }
