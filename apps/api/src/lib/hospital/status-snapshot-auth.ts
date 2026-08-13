import { timingSafeEqual } from "node:crypto"

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7)
  return token.length > 0 ? token : null
}
export function constantTimeTokenMatch(presented: string | null, expected: string): boolean {
  if (!presented || !expected) return false
  const actualBytes = Buffer.from(presented)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes)
}
