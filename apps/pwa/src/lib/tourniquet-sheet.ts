/**
 * The tourniquet body picker (10.2.0): choosing Tourniquet on or off in a
 * column's sheet opens it at that column's time. One at a time, through this
 * small store, like the shock and jet sheets.
 */
type Listener = () => void
export type TourniquetRequest = { ts: string; label: "Tourniquet on" | "Tourniquet off"; color: string }
let request: TourniquetRequest | null = null
const listeners = new Set<Listener>()
const emit = () => listeners.forEach(listener => listener())

export const tourniquetSheet = {
  open(next: TourniquetRequest) { request = next; emit() },
  close() { request = null; emit() },
  current: () => request,
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
}

export const isTourniquetLabel = (label: string): label is TourniquetRequest["label"] =>
  label === "Tourniquet on" || label === "Tourniquet off"
