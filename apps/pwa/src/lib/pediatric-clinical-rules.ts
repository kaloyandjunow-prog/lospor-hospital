import { useEffect, useState } from "react"
import {
  createClinicalRulesSnapshotRepository,
  type ClinicalRuleMode,
  type ClinicalRulesRuntimeBundle,
  type ClinicalRulesRuntimeSnapshot,
  type ClinicalRulesSnapshotStorage,
} from "@lospor/core/clinical-rules"
import { apiJson, decodeTokenPayload, getToken } from "@/lib/api"
import { clinicalSyncKv } from "@/lib/clinical-sync-kv"
import { CLINICAL_RULES_CACHE_PREFIX } from "@/lib/pediatric-clinical-rules-cache"
import {
  evaluateClinicalBaseline,
  type ClinicalBaselineFailure,
} from "@/lib/clinical-baseline-safety"

export type PediatricClinicalRulesResponse = ClinicalRulesRuntimeBundle
export type PediatricClinicalRulesSnapshot = ClinicalRulesRuntimeSnapshot

export function clinicalRulesStateForMode(input: {
  requestedMode: ClinicalRuleMode
  loadedMode: ClinicalRuleMode | null
  enabled: boolean
  snapshot: ClinicalRulesRuntimeSnapshot | null
  loading: boolean
  error: string | null
  prospectiveGuidanceEnabled: boolean
  baselineFailure: ClinicalBaselineFailure
}) {
  const current = input.enabled && input.loadedMode === input.requestedMode
  return {
    snapshot: current ? input.snapshot : null,
    loading: input.enabled && (!current || input.loading),
    error: current ? input.error : null,
    prospectiveGuidanceEnabled: current && input.prospectiveGuidanceEnabled,
    baselineFailure: current ? input.baselineFailure : "MISSING" as const,
  }
}

export function createPediatricClinicalRulesRepository(input: {
  fetchRules: () => Promise<PediatricClinicalRulesResponse>
  storage: ClinicalRulesSnapshotStorage
}) {
  return createClinicalRulesSnapshotRepository({
    cacheKey: `${CLINICAL_RULES_CACHE_PREFIX}:test:PEDIATRIC`,
    storage: input.storage,
    fetchRules: async () => evaluateClinicalBaseline(
      await input.fetchRules(),
      "PEDIATRIC",
    ).bundle,
  })
}

async function currentUserId(): Promise<string> {
  const payload = decodeTokenPayload(await getToken())
  return typeof payload?.id === "string" ? payload.id : "unknown"
}

function repository(
  userId: string,
  mode: ClinicalRuleMode,
) {
  return createClinicalRulesSnapshotRepository({
    cacheKey: `${CLINICAL_RULES_CACHE_PREFIX}:${userId}:${mode}`,
    fetchRules: async () => evaluateClinicalBaseline(
      await apiJson<unknown>(
        `/api/clinical/rules/runtime?mode=${mode}`,
        { timeoutMs: 8000 },
      ),
      mode,
    ).bundle,
    storage: clinicalSyncKv,
  })
}

export async function clearClinicalRulesSnapshots() {
  const keys = await clinicalSyncKv.keys?.(CLINICAL_RULES_PREFIX) ?? []
  await Promise.all(keys.map(key => clinicalSyncKv.delete(key)))
}

const CLINICAL_RULES_PREFIX = `${CLINICAL_RULES_CACHE_PREFIX}:`

export function useClinicalRules(
  mode: ClinicalRuleMode,
  enabled = true,
) {
  const [snapshot, setSnapshot] = useState<ClinicalRulesRuntimeSnapshot | null>(null)
  const [loadedMode, setLoadedMode] = useState<ClinicalRuleMode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prospectiveGuidanceEnabled, setProspectiveGuidanceEnabled] = useState(false)
  const [baselineFailure, setBaselineFailure] = useState<ClinicalBaselineFailure>("MISSING")
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null)
      setLoadedMode(null)
      setError(null)
      setLoading(false)
      setProspectiveGuidanceEnabled(false)
      setBaselineFailure("MISSING")
      return
    }
    let cancelled = false
    setLoading(true)
    void currentUserId()
      .then(userId => repository(userId, mode).load({ force: true }))
      .then(value => {
        if (!cancelled) {
          const evaluated = evaluateClinicalBaseline(value, mode)
          setSnapshot({
            ...evaluated.bundle,
            source: value.source,
            cachedAt: value.cachedAt,
          })
          setLoadedMode(mode)
          setProspectiveGuidanceEnabled(evaluated.prospectiveGuidanceEnabled)
          setBaselineFailure(evaluated.failure)
          setError(null)
        }
      })
      .catch(reason => {
        if (!cancelled) {
          setSnapshot(null)
          setLoadedMode(mode)
          setProspectiveGuidanceEnabled(false)
          setBaselineFailure("MISSING")
          setError(reason instanceof Error ? reason.message : "Clinical rules unavailable")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, mode, refreshToken])

  return {
    ...clinicalRulesStateForMode({
      requestedMode: mode,
      loadedMode,
      enabled,
      snapshot,
      loading,
      error,
      prospectiveGuidanceEnabled,
      baselineFailure,
    }),
    refresh: () => setRefreshToken(value => value + 1),
  }
}

export function usePediatricClinicalRules(enabled: boolean) {
  return useClinicalRules("PEDIATRIC", enabled)
}
