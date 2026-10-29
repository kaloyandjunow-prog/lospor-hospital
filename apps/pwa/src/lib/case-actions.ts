import { cancellationAllowed, isCaseClosed } from "@lospor/core/case-cancellation"

/**
 * What a case offers, on the dashboard's long-press menu and on the case
 * screen (10.0.0). One place, so the two cannot disagree, and each rule is
 * tested: a cancelled procedure is closed like a finished case; cancelling is
 * offered until anaesthesia starts and then shown inactive; nothing the server
 * would refuse is offered.
 */
export type CaseActionInput = {
  status?: string | null
  intraop?: { startedAt?: unknown; startTime?: unknown } | null
  /** The viewer may edit the case (caseIsWritable). */
  writable: boolean
  /** A handover is waiting for its recipient. */
  pendingTransfer?: boolean
  /** The site uses theatres and the case's can still change. */
  theatreChangeable?: boolean
}

export type CancelOffer = "available" | "inactive" | null

export type DashboardMenuActions = {
  print: boolean
  cancel: CancelOffer
  undoCancel: boolean
  remove: boolean
  theatre: boolean
  handOver: boolean
  withdrawHandover: boolean
}

export function dashboardMenuActions(input: CaseActionInput): DashboardMenuActions {
  const closed = isCaseClosed(input.status)
  const cancel: CancelOffer = !input.writable ? null
    : cancellationAllowed({ status: input.status, intraop: input.intraop }) ? "available"
      : closed ? null : "inactive"
  return {
    print: input.status === "COMPLETE",
    cancel,
    undoCancel: input.status === "CANCELLED" && input.writable,
    remove: !closed && input.writable,
    theatre: input.theatreChangeable === true,
    handOver: !closed && !input.pendingTransfer && input.writable,
    withdrawHandover: input.pendingTransfer === true,
  }
}

export type CaseScreenActions = {
  /** Edit preop, intraop and postop, finalise, and delete. */
  edit: boolean
  /** The timetable opens read-only rather than as the live intraop screen. */
  timetableReadOnly: boolean
}

export function caseScreenActions(input: Pick<CaseActionInput, "status" | "writable">): CaseScreenActions {
  const closed = isCaseClosed(input.status)
  return { edit: !closed && input.writable, timetableReadOnly: closed }
}
