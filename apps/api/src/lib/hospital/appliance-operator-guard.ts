/** Pure policy helper kept separate from the database adapter for exhaustive tests. */
export type ApplianceOperatorMutation =
  | "PASSWORD_RESET"
  | "SELF_DELETE"
  | "ADMIN_DELETE"
  | "DEMOTE"

export function applianceOperatorBlocksMutation(
  designated: boolean,
  mutation: ApplianceOperatorMutation,
): boolean {
  if (!designated) return false
  switch (mutation) {
    case "PASSWORD_RESET":
    case "SELF_DELETE":
    case "ADMIN_DELETE":
    case "DEMOTE":
      return true
  }
}
