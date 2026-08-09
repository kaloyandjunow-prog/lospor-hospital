import {
  parseClinicalSearchResults,
  searchIcd10,
  searchProcedures,
  type CanonicalSearchTag,
  type ClinicalSearchKind,
  type ClinicalSearchLocale,
} from "@lospor/core/search"

/**
 * Diagnosis and procedure lookup with no network.
 *
 * Both pickers were network-only, and on failure returned an empty list — which
 * reads as "no such code" rather than "you are offline". Worse, a case cannot be
 * finalised without a diagnosis, so a case documented offline could be completed
 * only to be blocked at the end. The vocabulary is bundled so that cannot happen.
 */

export type OfflineSearchOutcome = {
  results: CanonicalSearchTag[]
  /** Which copy answered — the UI says so rather than pretending it is live. */
  source: "offline"
  version: string
}

type VocabularyModule = typeof import("@lospor/core/vocabulary")

let vocabulary: VocabularyModule | null = null

/**
 * Loaded on first offline search, never at startup.
 *
 * The ICD-10 module is ~2.6 MB of source; evaluating it eagerly would cost
 * every launch, including the overwhelmingly common online one that never needs
 * it. `require` defers that until a search actually falls back.
 */
async function loadVocabulary(): Promise<VocabularyModule> {
  if (!vocabulary) {
    vocabulary = await import("@lospor/core/vocabulary")
  }
  return vocabulary
}

/** Whether this kind of search has an offline copy at all. */
export function hasOfflineVocabulary(kind: ClinicalSearchKind): boolean {
  return kind === "icd10" || kind === "procedure"
}

/**
 * The medication catalogue is deliberately not bundled here: the intraop option
 * library already ships its own offline fallback, and duplicating it would mean
 * two drug lists that can disagree.
 */
export async function searchOfflineVocabulary(
  kind: ClinicalSearchKind,
  query: string,
  locale: ClinicalSearchLocale,
): Promise<OfflineSearchOutcome | null> {
  if (!hasOfflineVocabulary(kind)) return null

  const { icd10Rows, procedureRows, VOCABULARY_VERSION } = await loadVocabulary()
  const raw = kind === "icd10"
    ? searchIcd10(icd10Rows(), query, locale)
    : searchProcedures(procedureRows(), query)

  return {
    // Reuse the same parser the network path uses, so a tag chosen offline is
    // shaped exactly like one chosen online and persists identically — plus a
    // stamp recording which copy of the vocabulary produced it.
    results: parseClinicalSearchResults(kind, raw, locale)
      .map(tag => ({ ...tag, vocabularyVersion: VOCABULARY_VERSION })),
    source: "offline",
    version: VOCABULARY_VERSION,
  }
}

/** The bundled vocabulary's version, for provenance and diagnostics. */
export async function offlineVocabularyVersion(): Promise<string> {
  return (await loadVocabulary()).VOCABULARY_VERSION
}
