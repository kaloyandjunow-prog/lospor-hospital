import { MEASUREMENT_DISPLAY_SPECS, roundMeasurement } from "./units"

/**
 * Numeric values for the monitors that carry one.
 *
 * The monitoring checklist answers "was it used". These three answer "what did
 * it read", which is the half a register can pool: a case whose BIS sat at 55
 * throughout and one that dropped to 22 for twenty minutes are the same case to
 * a yes/no flag, and so are a train-of-four of 0.9 and one of 0.4 at
 * extubation.
 *
 * Each value is bound to its modality flag. A value exists only while its
 * monitor is selected, which is why unselecting one clears it rather than
 * leaving an orphaned number nobody can interpret.
 */

export type CvpUnit = "cmH2O" | "mmHg"

/**
 * The conversion itself lives in the measurement spec, so the timetable and any
 * ordinary form field convert through the same table. Two conversion paths for
 * one quantity is how a value ends up depending on which screen entered it.
 *
 * Rounding at every boundary is not tidiness: 3.2 converted to cmH2O and back
 * is not 3.2, and a value typed, shown, and saved again drifts a digit at a
 * time until the record disagrees with the monitor.
 */
const CVP_SPEC = MEASUREMENT_DISPLAY_SPECS.cvp
function round1(value: number): number {
  return roundMeasurement(value, CVP_SPEC.precision)
}
const mmHgToCmH2O = CVP_SPEC.toAlternate
const cmH2OToMmHg = CVP_SPEC.toCanonical

/**
 * Storage is always mmHg, whatever the clinician typed.
 *
 * Two anaesthetists charting the same patient must produce the same stored
 * number, and a column whose unit follows a per-user display preference cannot
 * be pooled at all -- a mean CVP over a thousand cases would be an average of
 * two different quantities. cmH2O is the entry default because it is what the
 * transducers in this setting are usually scaled in.
 */
export function cvpToDisplay(mmHg: number, unit: CvpUnit): number {
  return round1(unit === "cmH2O" ? mmHgToCmH2O(mmHg) : mmHg)
}

export function cvpToCanonical(displayValue: number, unit: CvpUnit): number {
  return round1(unit === "cmH2O" ? cmH2OToMmHg(displayValue) : displayValue)
}

/** The canonical range, in mmHg. Every displayed range is derived from it. */
export const CVP_MIN_MMHG = 0.1
export const CVP_MAX_MMHG = 50

/** BIS is a dimensionless index and is read off as a whole number. */
export const BIS_MIN = 0
export const BIS_MAX = 100
export const BIS_STEP = 1

/**
 * The ratio, not the count. They are different measurements -- 0.9 and 4 both
 * mean "adequately reversed" but are not the same number, and one field taking
 * either would produce a column nobody could interpret. The count has its own
 * standard concept if it is ever added beside this.
 */
export const TOF_RATIO_MIN = 0
export const TOF_RATIO_MAX = 1
export const TOF_RATIO_STEP = 0.1

/**
 * The step coarsens above 10 mmHg because that is where the clinical question
 * changes. Below it a tenth separates a filled patient from an underfilled one
 * and is worth having; above it the number is already abnormal and tenths are
 * false precision.
 *
 * The threshold is expressed in whatever unit is on screen, so the granularity
 * a clinician gets does not depend on which unit they chose.
 */
export function cvpStep(displayValue: number, unit: CvpUnit): number {
  const threshold = unit === "cmH2O" ? mmHgToCmH2O(10) : 10
  return displayValue < threshold ? 0.1 : 0.5
}

/** The range as the entry control should show it, in the chosen unit. */
export function cvpDisplayRange(unit: CvpUnit): { min: number; max: number } {
  return {
    min: cvpToDisplay(CVP_MIN_MMHG, unit),
    max: cvpToDisplay(CVP_MAX_MMHG, unit),
  }
}

/**
 * Which monitoring flag reveals which vital row.
 *
 * Stated once so both clients gate the same rows on the same flags rather than
 * each restating it.
 *
 * Selection controls whether the row is *shown*, not whether its readings
 * exist. Unticking a monitor mid-case hides the lane; it does not delete what
 * was charted, exactly as the existing EtCO2 and temperature rows behave. A
 * reading taken at 09:40 happened, and a checkbox toggled at 11:00 does not
 * unmake it -- deleting on untick would lose real observations to a misclick.
 */
export const MONITORING_VITAL_ROWS = [
  { flag: "cvpMonitor", vital: "cvp" },
  { flag: "bis", vital: "bis" },
  { flag: "tofMonitor", vital: "tofRatio" },
] as const

export type MonitoringVitalRow = typeof MONITORING_VITAL_ROWS[number]

/**
 * Whether dismissing a vitals stepper may record the value it opened on.
 *
 * Dismissing commits that value. That is right when it carries the previous
 * reading forward -- it is how "unchanged since the last set" gets charted
 * without retyping -- and indefensible when there is no previous reading,
 * because the figure is then a population default nobody observed.
 *
 * **Every vital, since 2026-09-06.** This used to hold only BIS, TOF ratio and
 * CVP, on the reasoning that the older vitals had always behaved this way and
 * their defaults were at least plausible for a live patient. Plausible is the
 * problem. A blood pressure of 120/80 that nobody measured is indistinguishable
 * from one that somebody did, and it is more believable than an invented BIS,
 * not less -- so it survives every later reading of the record.
 *
 * It compounds through auto-fill, which is faithful and therefore dangerous
 * here: it copies the last recorded vital into each empty column, so one
 * dismissed blank control becomes a column of observations that reads as a
 * stable patient watched attentively for an hour.
 *
 * The cost is real and was accepted: a clinician who dismissed the control to
 * seed a starting set now records nothing, and has to enter the first reading.
 * A record that is missing a number invites the question; one that quietly
 * holds the wrong number does not.
 */
export function mayCommitVitalDefault(
  _vital: string,
  defaultIsPriorReading: boolean,
): boolean {
  return defaultIsPriorReading
}
