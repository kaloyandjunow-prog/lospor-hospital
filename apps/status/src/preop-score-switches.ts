/**
 * Scores that are optional on this appliance and need questions of their own.
 *
 * The questions stay individually switchable in the profile editor. Turning a
 * score on turns on every question it needs, so the score cannot be left half
 * configured; turning it off turns them off again. A score is on exactly when
 * all of its questions are -- that is also how the clinical apps decide
 * whether to draw it (Core isGuptaEnabled).
 */
export type PreopScoreSwitch = {
  key: string
  /** The name used in "Turning on Gupta turns on these as well". */
  name: string
  population: "ADULT" | "PEDIATRIC"
  labelEn: string
  labelBg: string
  questions: readonly string[]
}

export const PREOP_SCORE_SWITCHES: readonly PreopScoreSwitch[] = [
  {
    key: "GUPTA",
    name: "Gupta",
    population: "ADULT",
    labelEn: "Gupta cardiac risk (MICA)",
    labelBg: "Сърдечен риск по Gupta (MICA)",
    questions: ["A15_FUNCTIONAL_STATUS", "A16_GUPTA_PROCEDURE_TYPE"],
  },
]

/** The switches this population's profile can show: those whose questions are all in its catalogue. */
export function scoreSwitchesFor(population: string, catalogKeys: ReadonlySet<string>): PreopScoreSwitch[] {
  return PREOP_SCORE_SWITCHES.filter(item => item.population === population && item.questions.every(key => catalogKeys.has(key)))
}

/**
 * Apply the score switches of a submitted profile form. A ticked switch turns
 * its questions on; a switch that was on and has been unticked turns them off.
 * Otherwise each question keeps what its own box says.
 */
export function applyScoreSwitches<Q extends { stableKey: string; enabled: boolean; required: boolean }>(
  population: string,
  body: Record<string, unknown>,
  questions: Q[],
): Q[] {
  const keys = new Set(questions.map(question => question.stableKey))
  let result = questions
  for (const item of scoreSwitchesFor(population, keys)) {
    const on = body[`score_${item.key}`] === "true"
    const wasOn = body[`score_${item.key}_was`] === "true"
    if (!on && !wasOn) continue
    const inputs = new Set(item.questions)
    result = result.map(question => !inputs.has(question.stableKey)
      ? question
      : on ? { ...question, enabled: true } : { ...question, enabled: false, required: false })
  }
  return result
}
