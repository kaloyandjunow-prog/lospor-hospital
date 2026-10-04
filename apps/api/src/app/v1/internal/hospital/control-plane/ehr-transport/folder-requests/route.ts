import { NextResponse } from "next/server"
import {
  ehrFolderRequestsSchema,
  setEhrFolderRequests,
} from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

/** Switch asking the hospital system over the watched folder on or off (1.5.0). */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const input = ehrFolderRequestsSchema.parse(await boundedJson(request))
    const policy = await setEhrFolderRequests(input)
    return NextResponse.json({
      folderRequestsEnabled: policy.folderRequestsEnabled,
      folderRequestsChangedAt: policy.folderRequestsChangedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
