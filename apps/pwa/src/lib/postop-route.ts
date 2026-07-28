export function buildPostopRoute(caseId: string, continuedItems: string[]): string {
  const params = continuedItems.length > 0
    ? `?continuedItems=${encodeURIComponent(continuedItems.join("|"))}`
    : ""
  return `/(app)/cases/postop/${caseId}${params}`
}
