import "server-only"

/**
 * Convert an immutable finalization document into the read-only shape used by
 * the printable Web summary. Clinical sections come only from the stored JSON;
 * institution display metadata is the only relation resolved at read time.
 */
export function printableRecordFromSnapshot(
  snapshotDocument: string,
  institution: { name: string; city: string } | null,
): Record<string, unknown> | null {
  try {
    const snapshot = JSON.parse(snapshotDocument) as unknown
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null
    return {
      ...(snapshot as Record<string, unknown>),
      institution,
      capabilities: {
        canRead: true,
        canWrite: false,
        isCreator: false,
        isAssignee: false,
      },
    }
  } catch {
    return null
  }
}
