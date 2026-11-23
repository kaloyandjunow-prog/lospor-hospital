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
  /** 10.8.0: the viewer is an anaesthesia nurse (capabilities.isNurse). */
  nurse?: boolean
  /** 2026-11-23: the viewer may put nurses on this case (capabilities.canAssignNurses: the head, the administrator, the case's doctor, a senior nurse). */
  canAssignNurses?: boolean
  /** How many nurses the case has: a nurse may put herself on one that has none. */
  nursesOnCase?: number
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
  /** 10.8.0: the planned date of the operation (a doctor's decision). */
  plannedDate: boolean
  /** 10.8.0: a nurse passes her place in the case to another nurse. */
  handOverToNurse: boolean
  /** 10.8.0: the case's anaesthesia nurses (a doctor's decision). */
  assignNurses: boolean
  /** 2026-11-23: a nurse puts herself on a case that has no nurse. */
  takeCase: boolean
}

export function dashboardMenuActions(input: CaseActionInput): DashboardMenuActions {
  const closed = isCaseClosed(input.status)
  const cancel: CancelOffer = !input.writable ? null
    : cancellationAllowed({ status: input.status, intraop: input.intraop }) ? "available"
      : closed ? null : "inactive"
  if (input.nurse) {
    // A nurse never cancels, deletes, moves theatres or hands to a doctor (rules N1-N6).
    // A senior nurse also places nurses; a nurse hands her own place on, or takes a case that has none.
    const assigns = !closed && input.canAssignNurses === true
    return { print: input.status === "COMPLETE", cancel: null, undoCancel: false, remove: false, theatre: false, handOver: false,
      withdrawHandover: false, plannedDate: false, handOverToNurse: !closed && input.writable && !assigns, assignNurses: assigns,
      takeCase: !closed && input.nursesOnCase === 0 }
  }
  return {
    print: input.status === "COMPLETE",
    cancel,
    undoCancel: input.status === "CANCELLED" && input.writable,
    remove: !closed && input.writable,
    theatre: input.theatreChangeable === true,
    handOver: !closed && !input.pendingTransfer && input.writable,
    withdrawHandover: input.pendingTransfer === true,
    plannedDate: !closed && input.writable,
    handOverToNurse: false,
    assignNurses: !closed && input.writable && input.status !== "CANCELLED" && input.canAssignNurses !== false,
    takeCase: false,
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
