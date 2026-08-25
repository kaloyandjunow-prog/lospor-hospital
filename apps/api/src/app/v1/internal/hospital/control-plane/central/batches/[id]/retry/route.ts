import { NextResponse } from "next/server"
import {
  centralRetrySchema,
  retryCentralBatch,
} from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const { id } = await params
    const input = centralRetrySchema.parse(await boundedJson(request))
    const batch = await retryCentralBatch(id, input.reason)
    return NextResponse.json({ id: batch.id, status: batch.status }, {
      headers: ACCOUNT_CONTROL_HEADERS,
    })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
