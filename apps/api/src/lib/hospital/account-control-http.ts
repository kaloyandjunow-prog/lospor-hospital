import { NextResponse } from "next/server"
import { appUrl } from "@/lib/transactional-email"
import { HospitalAccountError } from "@/lib/hospital/account-provisioning"
import {
  STATUS_PRIVATE_NO_STORE,
  statusOperatorRequestAuthorized,
} from "@/lib/hospital/status-snapshot-auth"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export const ACCOUNT_CONTROL_HEADERS = STATUS_PRIVATE_NO_STORE

export async function authorizeAccountControl(request: Request): Promise<NextResponse | null> {
  if (!isHospitalDeployment()) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, {
      status: 404,
      headers: ACCOUNT_CONTROL_HEADERS,
    })
  }
  const authorization = await statusOperatorRequestAuthorized(request)
  if (!authorization.ok) {
    return NextResponse.json({
      error: authorization.status === 503 ? "Status control is not configured" : "Unauthorized",
      code: authorization.code,
    }, { status: authorization.status, headers: ACCOUNT_CONTROL_HEADERS })
  }
  return null
}

export async function boundedJson(request: Request, maximumBytes = 16_384): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (!Number.isFinite(declared) || declared < 0 || declared > maximumBytes) {
    throw new HospitalAccountError("INVALID_REQUEST")
  }
  const text = await request.text()
  if (Buffer.byteLength(text, "utf8") > maximumBytes) {
    throw new HospitalAccountError("INVALID_REQUEST")
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new HospitalAccountError("INVALID_REQUEST")
  }
}

/**
 * Put the one-time secret in the URL fragment. Browsers do not send fragments
 * in HTTP requests, so Caddy, Next.js, and ordinary access logs never receive
 * the token when the recipient opens the link.
 */
export function hospitalAccountAccessUrl(token: string): string {
  const url = new URL(appUrl("/reset-password"))
  url.hash = new URLSearchParams({ hospitalToken: token }).toString()
  return url.toString()
}

export function accountControlError(error: unknown): NextResponse {
  const code = error instanceof HospitalAccountError ? error.code : "ACCOUNT_CONTROL_FAILED"
  const status = {
    INVALID_REQUEST: 400,
    INSTITUTION_CANNOT_HAVE_HOD: 422,
    ACCOUNT_NOT_ACTIVE: 409,
    ACCOUNT_ALREADY_ACTIVE: 409,
    ACCOUNT_AUTHORITY_PROTECTED: 409,
    APPLIANCE_OPERATOR_MANAGED: 409,
    LAST_CLINICAL_ADMIN: 409,
    USERNAME_ALREADY_REGISTERED: 409,
    EMAIL_ALREADY_REGISTERED: 409,
    ACCOUNT_NOT_FOUND: 404,
    INSTITUTION_NOT_FOUND: 404,
    ACCOUNT_USERNAME_MISSING: 500,
  }[code] ?? 500

  // Never serialize an arbitrary exception: provider/database errors can carry
  // request values. The stable code is enough for Status to localize safely.
  return NextResponse.json({ error: code, code }, {
    status,
    headers: ACCOUNT_CONTROL_HEADERS,
  })
}
