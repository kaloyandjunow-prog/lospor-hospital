import { NextResponse } from "next/server"
import {
  externalAiModelsSchema,
  setExternalAiModels,
} from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"
import { advisorModelOrDefault, visionModelOrDefault } from "@/lib/hospital/external-ai-models"

export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const input = externalAiModelsSchema.parse(await boundedJson(request))
    const policy = await setExternalAiModels(input)
    return NextResponse.json({
      advisorModel: advisorModelOrDefault(policy.advisorModel),
      visionModel: visionModelOrDefault(policy.visionModel),
      modelsChangedAt: policy.modelsChangedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
