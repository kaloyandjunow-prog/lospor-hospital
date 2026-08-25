/**
 * Hospital operator-issued secrets live in the fragment so HTTP servers and
 * access logs never receive them. Query-token support remains for existing
 * email password-reset links.
 */
export function passwordLinkToken(search: string, hash: string): string {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""))
  return fragment.get("hospitalToken")
    ?? new URLSearchParams(search).get("token")
    ?? ""
}
