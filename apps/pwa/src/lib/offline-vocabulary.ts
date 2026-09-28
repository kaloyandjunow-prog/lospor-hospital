import {
  parseClinicalSearchResults,
  searchIcd10,
  searchProcedures,
  type CanonicalSearchTag,
  type ClinicalSearchKind,
  type ClinicalSearchLocale,
} from "@lospor/core/search"
import { searchMedications } from "@lospor/core/medications"

/**
 * Diagnosis, procedure and medication lookup with no network.
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
type MedicationModule = typeof import("@lospor/core/vocabulary/medications")

let vocabulary: VocabularyModule | null = null
let medications: MedicationModule | null = null

/**
 * Loaded on first offline search, never at startup.
 *
 * The complete ICD-10 module is intentionally large; evaluating it eagerly
 * would cost every launch, including the overwhelmingly common online one that
 * never needs it. The dynamic import defers parsing until search falls back,
 * while the PWA service worker downloads its chunk during installation.
 */
async function loadVocabulary(): Promise<VocabularyModule> {
  if (!vocabulary) {
    vocabulary = await import("@lospor/core/vocabulary")
  }
  return vocabulary
}

/** The medication list, in its own chunk: a diagnosis searched offline does not load it. */
async function loadMedications(): Promise<MedicationModule> {
  if (!medications) {
    medications = await import("@lospor/core/vocabulary/medications")
  }
  return medications
}

/** Whether this kind of search has an offline copy at all. */
export function hasOfflineVocabulary(kind: ClinicalSearchKind): boolean {
  return kind === "icd10" || kind === "procedure" || kind === "medication"
}

/**
 * Home medications and allergies search Core's medication list (9.13.3): the
 * list the server searches, with the same search, so the two cannot disagree.
 * It is not the intraop option library, which has its own offline fallback.
 */
export async function searchOfflineVocabulary(
  kind: ClinicalSearchKind,
  query: string,
  locale: ClinicalSearchLocale,
): Promise<OfflineSearchOutcome | null> {
  if (!hasOfflineVocabulary(kind)) return null

  if (kind === "medication") {
    const { medicationRows, MEDICATION_LIST_VERSION } = await loadMedications()
    const raw = searchMedications(medicationRows(), query).map(row => ({
      name: row.name, inn: row.inn, atcCode: row.atc, form: row.form, strength: row.strength,
    }))
    return {
      results: parseClinicalSearchResults(kind, raw, locale)
        .map(tag => ({ ...tag, vocabularyVersion: MEDICATION_LIST_VERSION })),
      source: "offline",
      version: MEDICATION_LIST_VERSION,
    }
  }

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
