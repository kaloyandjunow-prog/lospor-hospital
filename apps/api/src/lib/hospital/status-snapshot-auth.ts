import { timingSafeEqual } from "node:crypto"
import { readFile } from "node:fs/promises"

export const STATUS_PRIVATE_NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
}

async function configuredTokenFile(pathValue: string | undefined): Promise<string | null> {
  const path = pathValue?.trim()
  if (!path) return null
  try {
    const token = (await readFile(path, "utf8")).trim()
    return token.length >= 24 && token.length <= 8192 ? token : null
  } catch {
    return null
  }
}

async function configuredTokenOverlap(pathValue: string | undefined): Promise<string[]> {
  const path = pathValue?.trim()
  if (!path) return []
  const values = await Promise.all([
    configuredTokenFile(path),
    configuredTokenFile(`${path}.previous`),
  ])
  return values.filter((value, index): value is string =>
    Boolean(value) && values.indexOf(value) === index)
}

export function configuredStatusToken(): Promise<string | null> {
  return configuredTokenFile(process.env.HOSPITAL_STATUS_SNAPSHOT_TOKEN_FILE)
}

export function configuredStatusTokens(): Promise<string[]> {
  return configuredTokenOverlap(process.env.HOSPITAL_STATUS_SNAPSHOT_TOKEN_FILE)
}

export function configuredAccountControlToken(): Promise<string | null> {
  return configuredTokenFile(process.env.HOSPITAL_STATUS_ACCOUNT_CONTROL_TOKEN_FILE)
}

export function configuredAccountControlTokens(): Promise<string[]> {
  return configuredTokenOverlap(process.env.HOSPITAL_STATUS_ACCOUNT_CONTROL_TOKEN_FILE)
}

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

export function matchingConfiguredToken(
  presented: string | null,
  expected: readonly string[],
): string | null {
  let match: string | null = null
  for (const candidate of expected) {
    if (constantTimeTokenMatch(presented, candidate)) match = candidate
  }
  return match
}

export async function statusOperatorRequestAuthorized(request: Request): Promise<
  | { ok: true }
  | { ok: false; status: 401 | 503; code: "UNAUTHORIZED" | "STATUS_CONTROL_NOT_CONFIGURED" }
> {
  const expected = await configuredAccountControlTokens()
  if (expected.length === 0) return { ok: false, status: 503, code: "STATUS_CONTROL_NOT_CONFIGURED" }
  if (!matchingConfiguredToken(bearerToken(request), expected)) {
    return { ok: false, status: 401, code: "UNAUTHORIZED" }
  }
  return { ok: true }
}
