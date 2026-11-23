/**
 * Who may do what in a case (10.8.0). An anaesthetist may do everything the
 * case allows; an anaesthesia nurse works only in the cases assigned to her,
 * only in the intraoperative and postoperative stages, and never takes the
 * decisions that belong to the doctor. The API enforces this; the clients use
 * it to hide what would be refused.
 */

export type ClinicalRole = "ANAESTHETIST" | "ANAESTHESIA_NURSE" | "ANAESTHESIA_SENIOR_NURSE"

export type CaseAction =
  | "EDIT_PREOP"
  | "EDIT_INTRAOP"
  | "EDIT_POSTOP"
  | "CREATE_CASE"
  | "FINALISE"
  | "UNFINALISE"
  | "DELETE_CASE"
  | "CANCEL_PROCEDURE"
  | "CHANGE_RESPONSIBLE_DOCTOR"
  | "HAND_OVER_TO_DOCTOR"
  | "HAND_OVER_TO_NURSE"
  | "ASSIGN_NURSES"
  | "GIVE_DESPITE_ALLERGY"
  | "SET_PLANNED_SURGERY_DATE"
  | "INSTITUTION_SETTINGS"
  | "CLINICAL_RULES"
  | "AUDIT_LOG"
  | "STATUS"
  | "RESEARCH_EXPORT"

const NURSE_ALLOWED: ReadonlySet<CaseAction> = new Set<CaseAction>([
  "EDIT_INTRAOP",
  "EDIT_POSTOP",
  "HAND_OVER_TO_NURSE",
])

/** Whether a role may take an action at all (case assignment is checked separately). */
export function roleMay(role: ClinicalRole, action: CaseAction): boolean {
  if (role === "ANAESTHETIST") return action !== "HAND_OVER_TO_NURSE"
  // The senior nurse is a nurse who also places nurses on cases.
  if (role === "ANAESTHESIA_SENIOR_NURSE" && action === "ASSIGN_NURSES") return true
  return NURSE_ALLOWED.has(action)
}

/** The account role the API stores for an anaesthesia nurse. */
export const NURSE_ACCOUNT_ROLE = "ANAESTHESIA_NURSE" as const
/** ... and for the senior nurse (2026-11-23): a nurse who edits every case of her hospital and assigns nurses. */
export const SENIOR_NURSE_ACCOUNT_ROLE = "ANAESTHESIA_SENIOR_NURSE" as const
/** Both nurse account roles: what a nurse is, for the lists of nurses and for who may be put on a case. */
export const NURSE_ACCOUNT_ROLES = [NURSE_ACCOUNT_ROLE, SENIOR_NURSE_ACCOUNT_ROLE] as const

/** Whether an account role is a nurse's (a nurse or a senior nurse). */
export function isNurseAccountRole(accountRole: string | null | undefined): boolean {
  return accountRole === NURSE_ACCOUNT_ROLE || accountRole === SENIOR_NURSE_ACCOUNT_ROLE
}

/** The clinical role of an account role string. */
export function clinicalRoleOf(accountRole: string | null | undefined): ClinicalRole {
  return accountRole === SENIOR_NURSE_ACCOUNT_ROLE ? "ANAESTHESIA_SENIOR_NURSE" : accountRole === NURSE_ACCOUNT_ROLE ? "ANAESTHESIA_NURSE" : "ANAESTHETIST"
}

/**
 * Who may put nurses on a case (2026-11-23): the head of department and the administrator on every case of their
 * hospital, a doctor on her own cases only, a senior nurse on every case of her hospital. A nurse does not.
 */
export function mayAssignNurses(input: { accountRole: string | null | undefined; ownsCase: boolean; sameInstitution: boolean }): boolean {
  switch (input.accountRole) {
    case "ADMIN": return true
    case "HEAD_OF_DEPT": return input.sameInstitution
    case SENIOR_NURSE_ACCOUNT_ROLE: return input.sameInstitution
    case NURSE_ACCOUNT_ROLE: return false
    default: return input.ownsCase
  }
}

/** A nurse may put herself on a case that has no nurse yet. */
export function mayTakeCase(input: { accountRole: string | null | undefined; nursesOnCase: number; sameInstitution: boolean }): boolean {
  return isNurseAccountRole(input.accountRole) && input.sameInstitution && input.nursesOnCase === 0
}

/**
 * Whether a nurse on a theatre for a day sees a case there: a case of that
 * theatre that is not finalised and is planned for that day (or has no
 * planned date), or one she has already worked on, until it is finalised.
 */
export function nurseSeesTheatreCase(input: {
  caseTheatreId: string | null
  nurseTheatreId: string
  caseFinalised: boolean
  plannedSurgeryDate: string | null
  shiftDate: string
  nurseWorkedOnCase: boolean
}): boolean {
  if (input.caseFinalised) return false
  if (input.nurseWorkedOnCase) return true
  if (input.caseTheatreId !== input.nurseTheatreId) return false
  return input.plannedSurgeryDate == null || input.plannedSurgeryDate === input.shiftDate
}
