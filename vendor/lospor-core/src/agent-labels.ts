/**
 * The short inspired-fraction label of an inhalational agent, as a monitor
 * shows it (10.8.0): FiSev%, FiDes%, FiIso%. Shared so web and PWA label the
 * agent's percent the same way.
 */
const SHORT: Record<string, string> = {
  sevoflurane: "Sev",
  desflurane: "Des",
  isoflurane: "Iso",
  halothane: "Hal",
  enflurane: "Enf",
}

export function inhalationalFiLabel(agent: string | null | undefined): string {
  const key = (agent ?? "").trim().toLowerCase()
  const short = SHORT[key] ?? Object.entries(SHORT).find(([name]) => key.startsWith(name.slice(0, 4)))?.[1]
  return `Fi${short ?? (agent ?? "").trim()}%`
}
