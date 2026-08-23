import { NextResponse } from "next/server"
import {
  externalAiCredentialRemoveSchema,
  externalAiCredentialSchema,
  removeExternalAiCredential,
  replaceExternalAiCredential,
} from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const input = externalAiCredentialSchema.parse(await boundedJson(request))
    const result = await replaceExternalAiCredential(input)
    return NextResponse.json(result, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export async function DELETE(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const input = externalAiCredentialRemoveSchema.parse(await boundedJson(request))
    const result = await removeExternalAiCredential(input)
    return NextResponse.json(result, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
