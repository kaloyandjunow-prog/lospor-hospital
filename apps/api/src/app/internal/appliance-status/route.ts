import { readFile } from "node:fs/promises"
import { NextResponse } from "next/server"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { applianceStatusSnapshot } from "@/lib/hospital/appliance-status-snapshot"
import { bearerToken, constantTimeTokenMatch } from "@/lib/hospital/status-snapshot-auth"

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" }

async function configuredToken(): Promise<string | null> {
  const path = process.env.HOSPITAL_STATUS_SNAPSHOT_TOKEN_FILE?.trim()
  if (!path) return null
  try {
    const token = (await readFile(path, "utf8")).trim()
    return token.length >= 24 ? token : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  if (!isHospitalDeployment()) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE })
  }
  const expected = await configuredToken()
  if (!expected) {
    return NextResponse.json(
      { error: "Status snapshot is not configured", code: "STATUS_SNAPSHOT_NOT_CONFIGURED" },
      { status: 503, headers: NO_STORE },
    )
  }
  if (!constantTimeTokenMatch(bearerToken(request), expected)) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE },
    )
  }

  return NextResponse.json(await applianceStatusSnapshot(expected), { headers: NO_STORE })
}

export const dynamic = "force-dynamic"
