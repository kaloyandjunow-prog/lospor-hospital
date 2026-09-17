/**
 * Which Mistral models the appliance may use, pinned by dated identifier.
 *
 * The routes used to default to `open-mistral-7b` and `pixtral-12b-2409`,
 * which Mistral retired on 30 March 2025 and 31 December 2025, so every AI
 * feature failed as soon as a hospital added its key. A `-latest` alias would
 * move under a clinical feature without anyone choosing it, so only dated
 * models are offered, from Mistral's own catalogue (checked 13 September
 * 2026). Hospital controls chooses among them; when Mistral retires one,
 * the feature reports EXTERNAL_AI_MODEL_UNAVAILABLE and Status shows it.
 *
 * Adding a model is a release change: a new identifier belongs in this list
 * only once someone has checked what it does with lab reports and monitors.
 */

export const ADVISOR_MODELS = [
  "mistral-small-2603",
  "mistral-medium-2508",
  "mistral-large-2512",
] as const

/** Models that read images: lab report photos and monitor screens. */
export const VISION_MODELS = [
  "mistral-large-2512",
  "mistral-medium-2508",
  "mistral-small-2506",
  "ministral-14b-2512",
] as const

export type AdvisorModel = (typeof ADVISOR_MODELS)[number]
export type VisionModel = (typeof VISION_MODELS)[number]

/** Mistral Small 4: the current small general model, Apache 2.0. */
export const DEFAULT_ADVISOR_MODEL: AdvisorModel = "mistral-small-2603"
/** Mistral Large 3: the strongest current model that reads images, Apache 2.0. */
export const DEFAULT_VISION_MODEL: VisionModel = "mistral-large-2512"

export function advisorModelOrDefault(value: string | null | undefined): AdvisorModel {
  return (ADVISOR_MODELS as readonly string[]).includes(value ?? "") ? value as AdvisorModel : DEFAULT_ADVISOR_MODEL
}

export function visionModelOrDefault(value: string | null | undefined): VisionModel {
  return (VISION_MODELS as readonly string[]).includes(value ?? "") ? value as VisionModel : DEFAULT_VISION_MODEL
}

/**
 * True when Mistral refused the request because the model does not exist or
 * was retired.
 *
 * Reads at most a few kilobytes of the error body and keeps only the answer:
 * the body is never logged or returned, because a provider error may echo the
 * clinical request.
 */
export async function mistralModelUnavailable(response: Response): Promise<boolean> {
  if (response.status !== 400 && response.status !== 404 && response.status !== 422) return false
  try {
    const text = (await response.clone().text()).slice(0, 4096)
    return /invalid_model|invalid model|model[^"]{0,40}(not found|does not exist|deprecated|retired)/i.test(text)
  } catch {
    return false
  }
}
