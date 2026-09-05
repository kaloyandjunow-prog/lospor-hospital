import "server-only"

import {
  folderLabCoding,
  labCodeKey,
  resolveLabTest,
  type EhrCoding,
  type SiteLabCodeMap,
} from "@lospor/core/ehr-lab-codes"

/**
 * Naming and unit-filling a dropped file's laboratory results.
 *
 * The FHIR reader has done this since it was written: a hospital's own code is
 * resolved through the site's mapping, then LOINC, then imported under whatever
 * they called it; and a site's stated unit fills a gap when a result carries
 * none. A dropped file went through none of it, so an export from a laboratory
 * system that names its tests `ХГБ` arrived as an unrecognised test and was
 * refused, with no route to ever fix it. The operator's mapping screen -- the
 * one built on codes that have actually arrived, with counts -- listed nothing
 * for the transport that needs it most, because folder drop is the transport a
 * site reaches for when it cannot do FHIR.
 *
 * The same resolution, then, with the same table behind it. Two things had to
 * be decided to get there:
 *
 * A dropped result usually has no code, so its *name* becomes one under a
 * reserved system. That is what lets one table, one screen and one resolver
 * serve both transports rather than two of each that drift apart.
 *
 * A dropped result *may* carry a code. Where it does -- a site whose export
 * already emits LOINC -- it is used, and that site's mappings survive a change
 * of transport. It is deliberately optional: folder drop exists for hospitals
 * that cannot produce coded messages, so requiring codes would be asking for
 * the thing FHIR already provides.
 */

/** A lab result as a dropped file writes it. `system`/`code` are optional. */
export type FolderLabInput = {
  test?: unknown
  value?: unknown
  unit?: unknown
  takenAt?: unknown
  system?: unknown
  code?: unknown
}

export type FolderLabResolution = {
  /** The labs, renamed and unit-filled, ready for the canonical normaliser. */
  labs: Record<string, unknown>[]
  /** Codes nobody has mapped, for the operator's screen. */
  unmapped: { system: string; code: string; display: string }[]
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/**
 * The codings to try for one dropped result, best first.
 *
 * A file that carries a code gets the coded path, exactly as a FHIR result
 * would. Its name is offered too, and after the code rather than before: a
 * laboratory's own label is the weaker statement of the two, and where both
 * exist the code is what a site will have mapped.
 */
function codingsFor(lab: FolderLabInput, name: string): EhrCoding[] {
  const code = text(lab.code)
  const coded: EhrCoding[] = code
    ? [{ system: text(lab.system) ?? "", code, display: name }]
    : []
  return [...coded, folderLabCoding(name)]
}

/**
 * Resolve a dropped file's labs against what this site has configured.
 *
 * Nothing is dropped and nothing is blocked: an unmapped result keeps the
 * hospital's own name and is reported so the site can be asked. That is the
 * same bargain the FHIR reader strikes, and for the same reason -- an absent
 * result is reviewed by nobody.
 */
export function resolveFolderLabs(
  raw: unknown,
  options: {
    siteMap?: SiteLabCodeMap
    /** Units a site has stated for codes that arrive without one. */
    assumedUnits?: Readonly<Record<string, string>>
  } = {},
): FolderLabResolution {
  if (!Array.isArray(raw)) return { labs: [], unmapped: [] }

  const unmapped = new Map<string, { system: string; code: string; display: string }>()
  const labs: Record<string, unknown>[] = []

  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const lab = item as FolderLabInput
    const name = text(lab.test)
    // A result with no name at all cannot be resolved, reviewed or mapped.
    // Passed through untouched so the canonical normaliser refuses it the same
    // way it refuses one from any other transport.
    if (!name) { labs.push({ ...(item as Record<string, unknown>) }); continue }

    const codings = codingsFor(lab, name)
    const resolved = resolveLabTest(codings, { siteMap: options.siteMap, text: name })

    if (resolved.unmapped && resolved.unresolved) {
      unmapped.set(`${resolved.unresolved.system}|${resolved.unresolved.code}`, resolved.unresolved)
    }

    // The site's stated unit fills a gap, never replaces a reported one --
    // the same rule the FHIR reader follows. Tried against every coding this
    // result has, because a site only ever answers for codes it has seen.
    const reportedUnit = text(lab.unit)
    const assumed = reportedUnit
      ? undefined
      : codings
          .map(coding => options.assumedUnits?.[labCodeKey(coding.system, coding.code)])
          .find(Boolean)

    labs.push({
      ...(item as Record<string, unknown>),
      test: resolved.test,
      // What they called it, kept whenever we renamed it, so the review screen
      // can show a clinician the label their laboratory printed.
      ...(resolved.test !== name ? { reportedTest: name } : {}),
      ...(reportedUnit ? {} : assumed ? { unit: assumed } : {}),
    })
  }

  return { labs, unmapped: [...unmapped.values()] }
}
