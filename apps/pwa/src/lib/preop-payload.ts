export {
  buildCanonicalPreopFormPayload as buildPreopPayload,
} from "@lospor/core/case-payloads"

import { buildCanonicalPreopFormPayload } from "@lospor/core/case-payloads"

/** Patient linkage is create-only and must never enter clinical preop JSON. */
export function buildClinicalPreopPayload(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...buildCanonicalPreopFormPayload(values) } as Record<string, unknown>
  delete payload.patientNumber
  return payload
}

