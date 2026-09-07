/**
 * Whether a screen may advance after a save, decided once instead of four
 * times.
 *
 * Every multi-step case screen asks the same question after every save: the
 * result came back as saved/queued/blocked/conflict/failed/empty -- is it
 * safe to move the clinician on to the next step? Each of web's three step
 * handlers and mobile's single handler answered it separately, and had
 * drifted: web's preop and intraop handlers advanced the UI before the save
 * had even resolved, so a save that failed outright (no connection at all,
 * before a case existed) left the clinician documenting a case that was never
 * created, with the intraop and postop screens open and nothing underneath
 * them. Web's own postop handler, and all of mobile, already waited and
 * checked -- this is that correct pattern, made explicit and shared.
 */

/** The result shapes the outbox's `save`/`flushOne` already produce. */
export type SaveOutcomeKind = "saved" | "queued" | "blocked" | "conflict" | "failed" | "empty"

export type SaveProgressContext = {
  /**
   * Whether a durable case id existed on the server before this save was
   * attempted. The very first save is different from every edit after it: a
   * "queued" first save has nothing durable to advance into yet -- there is
   * no case another screen, another device, or a reopened session could find
   * -- while a "queued" edit to a case that already exists is safe, because
   * the outbox guarantees it reaches the server eventually and the case is
   * already there to reopen in the meantime.
   */
  caseExistedBeforeSave: boolean
}

export type SaveProgressDecision =
  | { canProgress: true }
  | {
      canProgress: false
      /**
       * `"blocked"` and `"conflict"` carry their own detail on the outcome the
       * caller already has (the blocked issue, the conflict info) -- this
       * only says which kind of "stay" it is, not what to show for it.
       */
      reason: "blocked" | "conflict" | "failed" | "no-case-yet"
    }

/**
 * `outcome` is the `CasePatchResult` (or equivalent) the save just returned.
 * Call this once per save attempt in a submit handler, not once per handler --
 * mobile's preop submit makes two saves (the section, then a bookkeeping
 * transition write) and each has its own answer.
 */
export function canProgressAfterSave(
  outcome: SaveOutcomeKind,
  context: SaveProgressContext,
): SaveProgressDecision {
  if (outcome === "blocked") return { canProgress: false, reason: "blocked" }
  if (outcome === "conflict") return { canProgress: false, reason: "conflict" }
  if (outcome === "failed") return { canProgress: false, reason: "failed" }

  if (outcome === "saved") return { canProgress: true }

  if (outcome === "queued") {
    return context.caseExistedBeforeSave
      ? { canProgress: true }
      : { canProgress: false, reason: "no-case-yet" }
  }

  // "empty": the outbox found nothing pending to send. There is nothing here
  // to block on -- an edit that changed nothing is not a reason to keep the
  // clinician on this screen -- so this is a pass, not a special case of
  // failure.
  return { canProgress: true }
}
