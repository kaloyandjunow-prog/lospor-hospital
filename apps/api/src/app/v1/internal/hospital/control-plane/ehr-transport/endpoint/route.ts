import { NextResponse } from "next/server"
import {
  ehrTransportEndpointSchema,
  setEhrTransportEndpoint,
} from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

/**
 * Where a network transport sends, and how it presents itself.
 *
 * Separate from the transport choice because they change for different reasons:
 * a site picks its transport once and adjusts an endpoint or rotates a client
 * id afterwards. Everything set here is readable back; only the secret is
 * sealed, and that goes through the credential route.
 */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const input = ehrTransportEndpointSchema.parse(await boundedJson(request))
    const policy = await setEhrTransportEndpoint(input)
    return NextResponse.json({
      endpoint: policy.endpoint,
      authMode: policy.authMode,
      tokenUrl: policy.tokenUrl,
      clientId: policy.clientId,
      scope: policy.scope,
      endpointChangedAt: policy.endpointChangedAt,
      // Says plainly when changing the endpoint invalidated the stored secret,
      // so an operator knows to set a new one rather than discovering it from
      // a failed delivery later.
      credentialCleared: policy.credentialCiphertext === null,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
