/**
 * Read `capabilities.canWrite` off a case response, failing closed.
 *
 * The case endpoints return a `capabilities` object per reader, because the
 * creator of a case and its current assignee stop being the same person once
 * the case has been handed on: the creator keeps read and print access inside
 * their institution and loses write. Web used to ignore the object entirely
 * and drew Edit, Close Now and Unfinalize for everyone, all of which the API
 * then refused; mobile derived edit permission from `status !== "COMPLETE"`
 * alone and had the identical gap.
 *
 * Anything other than an explicit `canWrite: true` is read-only — an older
 * server that does not send the object, a truncated body, a response shape
 * that changed. A missing field must never be the thing that grants edit
 * rights. Shared so both clients fail closed the same way rather than each
 * getting one chance to get this right.
 */
export function caseIsWritable(source: unknown): boolean {
  if (!source || typeof source !== "object") return false
  const capabilities = (source as { capabilities?: unknown }).capabilities
  if (!capabilities || typeof capabilities !== "object") return false
  return (capabilities as { canWrite?: unknown }).canWrite === true
}
