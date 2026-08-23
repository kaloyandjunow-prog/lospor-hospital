import { bearerToken, matchesSecret } from "@/lib/constant-time-secret"

const MINIMUM_SECRET_LENGTH = 24
const MAXIMUM_SECRET_LENGTH = 8192

/**
 * Return the current credential and, during a bounded rotation window, its
 * explicitly configured predecessor. Empty, malformed, and duplicate values
 * are ignored. The caller removes the predecessor after every producer has
 * switched, which makes the old credential stop working without a flag day.
 */
export function configuredSecretOverlap(...values: Array<string | undefined>): string[] {
  const configured: string[] = []
  for (const value of values) {
    const secret = value?.trim()
    if (!secret || secret.length < MINIMUM_SECRET_LENGTH
      || secret.length > MAXIMUM_SECRET_LENGTH || configured.includes(secret)) continue
    configured.push(secret)
  }
  return configured
}

export function matchesAnySecret(presented: string | null, configured: readonly string[]): boolean {
  // Do not return early: when values have the same length, every configured
  // overlap candidate receives the same constant-time comparison work.
  let matched = false
  for (const secret of configured) {
    if (matchesSecret(presented ?? "", secret)) matched = true
  }
  return matched
}

export function bearerMatchesAnySecret(request: Request, configured: readonly string[]): boolean {
  return matchesAnySecret(bearerToken(request), configured)
}

export function headerMatchesAnySecret(
  request: Request,
  header: string,
  configured: readonly string[],
): boolean {
  return matchesAnySecret(request.headers.get(header), configured)
}
