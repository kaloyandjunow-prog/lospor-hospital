import type { PostopFormData } from "@/lib/postop-form-schema"
import type { ClinicalStringKey } from "@/i18n/clinical-strings"

export type AldreteCriterion = {
  field: keyof Pick<PostopFormData,
    "aldreteActivity" | "aldreteRespiration" | "aldreteCirculation" | "aldreteConsciousness" | "aldreteSpO2"
    | "stewardConsciousness" | "stewardAirway" | "stewardMovement">
  label: string
  /** What 0, 1 and 2 mean for this component, in that order. */
  descriptions: [string, string, string]
}

/**
 * The five components of the modified Aldrete score, in the order they are
 * scored at the bedside.
 *
 * A function of the translator rather than a constant, because every string in
 * it is translated -- which is the only reason it used to be rebuilt inside the
 * screen's own body on every render.
 */
export function aldreteCriteria(tc: (key: ClinicalStringKey) => string): AldreteCriterion[] {
  return [
    {
      field: "aldreteActivity",
      label: tc("aldreteActivity"),
      descriptions: [tc("aldreteNoMovement"), tc("aldrete2Extremities"), tc("aldreteAllExtremities")],
    },
    {
      field: "aldreteRespiration",
      label: tc("aldreteRespiration"),
      descriptions: [tc("aldreteApnoeic"), tc("aldreteShallow"), tc("aldreteDeepBreath")],
    },
    {
      field: "aldreteCirculation",
      label: tc("aldreteCirculation"),
      descriptions: [tc("aldreteBP50"), tc("aldreteBP20to49"), tc("aldreteBP20")],
    },
    {
      field: "aldreteConsciousness",
      label: tc("aldreteConsciousness"),
      descriptions: [tc("aldreteNoResponse"), tc("aldreteArousable"), tc("aldreteAwake")],
    },
    {
      field: "aldreteSpO2",
      label: tc("aldreteSpO2"),
      descriptions: [tc("aldreteSpO2Low"), tc("aldreteSpO2Mid"), tc("aldreteSpO2High")],
    },
  ]
}

/**
 * The three components of the Steward score, a child's recovery score in place
 * of Aldrete (10.0.0): consciousness, airway, movement.
 */
export function stewardCriteria(tc: (key: ClinicalStringKey) => string): AldreteCriterion[] {
  return [
    {
      field: "stewardConsciousness",
      label: tc("stewardConsciousness"),
      descriptions: [tc("stewardNotResponding"), tc("stewardRespondsToStimuli"), tc("stewardAwake")],
    },
    {
      field: "stewardAirway",
      label: tc("stewardAirway"),
      descriptions: [tc("stewardAirwayMaintained"), tc("stewardGoodAirway"), tc("stewardCoughsCries")],
    },
    {
      field: "stewardMovement",
      label: tc("stewardMovement"),
      descriptions: [tc("stewardNotMoving"), tc("stewardNonPurposeful"), tc("stewardPurposeful")],
    },
  ]
}
