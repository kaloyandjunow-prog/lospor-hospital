import { NextResponse } from "next/server"
import { z } from "zod"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
} from "./account-control-http"
import { HospitalControlPlaneError } from "./control-plane"
import { EhrTransportPolicyError } from "./ehr-transport-policy"
import { ExternalAiPolicyError } from "./external-ai-policy"
import { HospitalResearchControlError } from "./research-control"

export { ACCOUNT_CONTROL_HEADERS, authorizeAccountControl, boundedJson }

export function controlPlaneError(error: unknown): NextResponse {
  const code = error instanceof HospitalControlPlaneError
    || error instanceof ExternalAiPolicyError
    || error instanceof EhrTransportPolicyError
    || error instanceof HospitalResearchControlError
    ? error.code
    : error instanceof z.ZodError
      ? "INVALID_CONTROL_REQUEST"
      : "HOSPITAL_CONTROL_FAILED"
  const status = code === "INVALID_CONTROL_REQUEST"
    || (code.endsWith("_INVALID")
      && code !== "EXTERNAL_AI_SEAL_KEY_INVALID" && code !== "EHR_TRANSPORT_SEAL_KEY_INVALID")
    ? 400
    : code.includes("NOT_FOUND") ? 404
      : code.includes("NOT_ACTIVE") || code.includes("TERMINAL")
        || code.includes("NOT_READY") || code.includes("NOT_LOCKED")
        || code.includes("NOT_APPROVABLE") || code.includes("NOT_RETRYABLE")
        || code.includes("UNAVAILABLE") || code.includes("ALREADY")
        || code.includes("UNREADABLE") || code.includes("NOT_CONFIGURED")
        || code === "EXTERNAL_AI_SEAL_KEY_INVALID" || code === "EHR_TRANSPORT_SEAL_KEY_INVALID"
        || code === "EHR_TRANSPORT_NOT_CREDENTIALED"
        ? 409
        : code.includes("REQUIRED") || code.includes("MISMATCH")
          ? 422
          : 500
  return NextResponse.json({ error: code, code }, {
    status,
    headers: ACCOUNT_CONTROL_HEADERS,
  })
}
