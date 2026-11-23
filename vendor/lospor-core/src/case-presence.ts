/**
 * Who has a case open right now (10.8.0). Several people may work in one case at once -- the anaesthetist
 * and the nurses -- and the last edit wins, so each should see who else is in it. A screen reports itself
 * every {@link CASE_PRESENCE_HEARTBEAT_MS} and counts as present for {@link CASE_PRESENCE_TTL_MS} after
 * its last report.
 */
export const CASE_PRESENCE_HEARTBEAT_MS = 20_000
export const CASE_PRESENCE_TTL_MS = 60_000

export type CasePresencePerson = { name: string; you: boolean }

/** What the presence route answers: the distinct people in the case, and how many screens are open. */
export type CasePresence = { people: CasePresencePerson[]; screens: number }

/**
 * The line shown above a case when more than one screen is open on it, or "" when this screen is alone
 * ("Случаят е отворен от: Мария (вие), Иван"). Names are the clinicians' own, as the case's people see them.
 */
export function casePresenceLabel(presence: CasePresence | null | undefined, language: "bg" | "en"): string {
  if (!presence || presence.screens < 2 || presence.people.length === 0) return ""
  const you = language === "bg" ? "вие" : "you"
  const names = presence.people.map(person => (person.you ? `${person.name} (${you})` : person.name)).join(", ")
  return `${language === "bg" ? "Случаят е отворен от" : "Case open by"}: ${names}`
}
