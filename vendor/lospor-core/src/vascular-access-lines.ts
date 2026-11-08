/**
 * Vascular access lines that fail (10.2.0). A line that fails stays on the
 * access list, marked failed with the time, next to the line that replaced
 * it; "failed" shows everywhere the list does -- the intraop tab, the event
 * log, the export and the printed protocol. Nothing is deleted.
 */

export type AccessKind = "VENOUS" | "ARTERIAL" | "CENTRAL"

export type VascularLine = {
  id?: string
  site: string
  siteLabel?: string
  size?: string
  sizeUnit?: string
  depthCm?: string
  lumens?: string
  preexisting?: boolean
  /** When it went in (10.2.0); absent on lines entered before. */
  insertedAt?: string | null
  /** The clinical event that created or reconciled this line, when known. */
  sourceEventId?: string
  failed?: boolean
  failedAt?: string | null
  [key: string]: unknown
}

/** The kind of a site: peripheral venous, arterial, or central (CVC and PICC). */
export function accessKindOf(site: string | null | undefined): AccessKind | null {
  if (!site) return null
  if (site === "ARTERIAL" || site.startsWith("ART_")) return "ARTERIAL"
  if (site === "VEN_CENTRAL" || site.startsWith("CVK") || site.startsWith("PICC")) return "CENTRAL"
  if (site === "VEN_PERIPHERAL" || site === "VENOUS") return "VENOUS"
  return null
}

/** The kind of line each line-failure complication is about. */
export const ACCESS_KIND_OF_COMPLICATION: Readonly<Record<string, AccessKind>> = Object.freeze({
  "IV line failure / extravasation": "VENOUS",
  "Arterial line failure": "ARTERIAL",
  "CVK failure": "CENTRAL",
})

/** The clinical event a new line of a kind is charted as. */
export function accessEventLabel(kind: AccessKind, site?: string | null): string {
  if (kind === "ARTERIAL") return "Art line in"
  if (kind === "CENTRAL") return site?.startsWith("PICC") ? "PICC" : "CVC in"
  return "IV line in"
}

/** The lines of a kind still working: the ones a failure could be about. */
export function workingLinesOfKind(lines: readonly VascularLine[], kind: AccessKind): VascularLine[] {
  return lines.filter(line => !line.failed && accessKindOf(line.site) === kind)
}

/**
 * Which line failed: the only working one of that kind, or null when there
 * are several (the card asks to pick exactly one) or none.
 */
export function failedLineCandidate(lines: readonly VascularLine[], kind: AccessKind): VascularLine | null {
  const working = workingLinesOfKind(lines, kind)
  return working.length === 1 ? working[0]! : null
}

const sameLine = (a: VascularLine, b: VascularLine, indexA: number, indexB: number) =>
  a.id != null && b.id != null ? a.id === b.id : indexA === indexB

/**
 * The list with one line marked failed at a time and, when given, the new
 * line added after it. The line is matched by id, or by position for lines
 * saved without one.
 */
export function replaceFailedLine(
  lines: readonly VascularLine[],
  failedIndex: number,
  at: string,
  next?: VascularLine | null,
): VascularLine[] {
  const target = lines[failedIndex]
  if (!target) return [...lines]
  const updated = lines.map((line, index) => (sameLine(line, target, index, failedIndex) ? { ...line, failed: true, failedAt: at } : line))
  return next ? [...updated, { ...next, insertedAt: next.insertedAt ?? at }] : updated
}

/** A line's text with its state: "Peripheral IV 18G · failed 10:42". */
export function vascularLineText(line: VascularLine, words: { failed: string; time: (iso: string) => string }): string {
  const size = line.size ? ` ${line.size}${line.sizeUnit ?? ""}` : ""
  const name = `${line.siteLabel || line.site}${size}`
  return line.failed ? `${name} · ${words.failed}${line.failedAt ? ` ${words.time(line.failedAt)}` : ""}` : name
}
