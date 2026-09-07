/**
 * Whether a thrown error means "the network hiccuped," not "the server said
 * no." The outbox's `save()` queues a network failure for automatic retry;
 * anything else propagates to the caller as a failure to surface, so getting
 * this wrong in either direction either loses an edit or hides a real
 * server-side refusal behind a silent retry.
 *
 * Covers a fetch that could not complete at all -- refused connection, DNS
 * failure, CORS -- which both runtimes report as a `TypeError`, and one that
 * was aborted by a client-side timeout, reported as an error named
 * "AbortError" on both the DOM and React Native's fetch.
 *
 * The two clients used to decide the second case differently: mobile treated
 * an aborted request as a network hiccup and queued it, while web had no
 * abort handling at all and let it propagate as unrecoverable. A save that
 * merely took too long on a slow connection was therefore queued and retried
 * on the phone, and silently lost on the web -- for the same failure, on the
 * same account. Each app still recognises its own HTTP error class and the
 * server-refusal details on it; this is only the one check that decides
 * whether an error is a network hiccup at all, shared so the two cannot
 * disagree about it again.
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  return error instanceof Error && error.name === "AbortError"
}
