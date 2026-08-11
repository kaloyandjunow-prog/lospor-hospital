import type {
  ClinicalPresetDto,
  ClinicalPresetScope,
  ClinicalRulePayload,
  PediatricClinicalRulePayload,
} from "@lospor/core/clinical-rules"

/**
 * Which clinical presets a user may see, and which they own.
 *
 * This decides whether one institution's dosing rules are visible to another,
 * and it lived in the middle of a 1,200-line page component with no test. The
 * rules are short but they are not obvious: ownership and visibility are
 * deliberately different questions, and a published preset reaches further than
 * an unpublished one.
 *
 * The actor is narrowed to what these functions actually read rather than the
 * whole workbench DTO, so they can be exercised without constructing one.
 */

export type PresetActor = {
  id: string
  institutionId: string | null
}

/**
 * Whether the preset is owned by the context being edited.
 *
 * Platform presets belong to the platform context; institution presets belong
 * to the institution that owns them, and to no other; user presets belong to
 * the person who made them.
 */
export function presetBelongsToContext(
  preset: Pick<ClinicalPresetDto, "scope" | "ownerInstitutionId" | "ownerUserId">,
  scope: ClinicalPresetScope,
  actor: PresetActor,
  ownerInstitutionId: string | null,
): boolean {
  if (preset.scope !== scope) return false
  if (scope === "PLATFORM") return true
  if (scope === "INSTITUTION") {
    return !!ownerInstitutionId && preset.ownerInstitutionId === ownerInstitutionId
  }
  return preset.ownerUserId === actor.id
}

/**
 * Whether the preset should appear while working in this context.
 *
 * Wider than ownership, and deliberately so: a published platform preset is
 * visible to an institution, and a published institution preset is visible to
 * its own members working on their personal presets. Anything unpublished is
 * visible only to whoever owns it — a draft dosing rule must not leak out of
 * the institution drafting it.
 */
export function presetVisibleInContext(
  preset: Pick<ClinicalPresetDto, "scope" | "status" | "ownerInstitutionId" | "ownerUserId">,
  scope: ClinicalPresetScope,
  actor: PresetActor,
  ownerInstitutionId: string | null,
): boolean {
  if (presetBelongsToContext(preset, scope, actor, ownerInstitutionId)) return true
  if (preset.status !== "PUBLISHED") return false
  if (scope === "INSTITUTION") return preset.scope === "PLATFORM"
  if (scope === "USER") {
    return preset.scope === "PLATFORM"
      || (preset.scope === "INSTITUTION" && preset.ownerInstitutionId === actor.institutionId)
  }
  return false
}

/** Equipment rules use a different editor from dosing rules. */
export function isEquipmentRule(payload: { kind: string }): boolean {
  return payload.kind === "ADULT_EQUIPMENT_PROFILE"
    || payload.kind === "PEDIATRIC_EQUIPMENT"
    || payload.kind === "PEDIATRIC_EQUIPMENT_POLICY"
}

/**
 * Narrows a rule payload to the paediatric ones the paediatric editor handles,
 * or null. Returning null rather than casting is what keeps an adult payload
 * from reaching an editor that would read paediatric fields off it.
 */
export function pediatricEditorPayload(
  payload: ClinicalRulePayload | null,
): PediatricClinicalRulePayload | null {
  if (!payload) return null
  switch (payload.kind) {
    case "PEDIATRIC_DRUG_DOSE":
    case "PEDIATRIC_DRUG_PROFILE":
    case "PEDIATRIC_DRUG_POLICY":
    case "PEDIATRIC_FLUID_PROFILE":
    case "PEDIATRIC_INFUSION_PROFILE":
      return payload
    default:
      return null
  }
}
