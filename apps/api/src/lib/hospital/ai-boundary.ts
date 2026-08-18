import { NextResponse } from "next/server"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

/**
 * No clinical data leaves a hospital appliance for an AI provider. Ever.
 *
 * Today the appliance is safe by omission: compose.yaml does not pass
 * MISTRAL_API_KEY, so the container never sees one and every AI route answers
 * 503 for want of configuration. That is a real boundary, but it is an absence
 * rather than a decision -- one line added to the environment block and the
 * preoperative summary of a named patient starts leaving the hospital network,
 * with nothing in the code objecting.
 *
 * This makes it a decision. On an appliance the answer is no regardless of
 * configuration, checked before the key is read, so setting a key cannot turn
 * the feature on.
 *
 * verify-no-external-telemetry.mjs holds the other half: it fails the build if
 * an AI key is ever wired into the appliance's deployment files, and if any AI
 * route stops calling this.
 */
export function refuseAiOnAppliance(): NextResponse | null {
  if (!isHospitalDeployment()) return null
  return NextResponse.json(
    {
      error: "AI features are disabled on a hospital appliance",
      code: "AI_DISABLED_ON_APPLIANCE",
    },
    { status: 503 },
  )
}
