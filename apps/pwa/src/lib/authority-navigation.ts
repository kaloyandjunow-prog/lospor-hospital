export type AuthorityNavigation = "ADMINISTRATION" | "INSTITUTION_REQUESTS"

/**
 * The institution-request queue is an organizational responsibility, not an
 * administrator-only surface. A head of department can decide requests for
 * their own institution; the API continues to enforce that exact scope.
 */
export function authorityNavigationForRole(
  role: string | null | undefined,
): AuthorityNavigation | null {
  if (role === "ADMIN") return "ADMINISTRATION"
  if (role === "HEAD_OF_DEPT") return "INSTITUTION_REQUESTS"
  return null
}
