import "server-only"
import { jwtVerify } from "jose"
import { isRevokedAsync } from "@/lib/token-blocklist"

function secret() {
  const value = process.env.LOSPOR_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!value) throw new Error("LOSPOR_AUTH_SECRET or NEXTAUTH_SECRET is required")
  return new TextEncoder().encode(value)
}

export type PrintTokenClaims = {
  userId: string
  deliveryId?: string
  finalizationId?: string
}

export async function verifyPrintTokenClaims(token: string, caseId: string): Promise<PrintTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.type !== "print" || payload.caseId !== caseId) return null
    const jti = payload.jti as string | undefined
    if (jti && await isRevokedAsync(jti)) return null
    const userId = typeof payload.userId === "string" ? payload.userId : ""
    if (!userId) return null
    return {
      userId,
      ...(typeof payload.deliveryId === "string" ? { deliveryId: payload.deliveryId } : {}),
      ...(typeof payload.finalizationId === "string" ? { finalizationId: payload.finalizationId } : {}),
    }
  } catch {
    return null
  }
}

export async function verifyPrintToken(token: string, caseId: string) {
  return (await verifyPrintTokenClaims(token, caseId))?.userId ?? null
}
