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

type HospitalGuidanceState = { enabled: boolean; prospectiveOnly: true }
export type PediatricClinicalRulesResponse = ClinicalRulesRuntimeBundle & {
  guidance?: HospitalGuidanceState
}
export type PediatricClinicalRulesSnapshot = ClinicalRulesRuntimeSnapshot & {
  guidance: HospitalGuidanceState
}

function failClosedGuidance<T extends ClinicalRulesRuntimeBundle>(
  value: T,
): T & { guidance: HospitalGuidanceState } {
  const guidance = (value as T & { guidance?: unknown }).guidance
  const accepted = guidance !== null && typeof guidance === "object"
    && typeof (guidance as { enabled?: unknown }).enabled === "boolean"
    && (guidance as { prospectiveOnly?: unknown }).prospectiveOnly === true
  return {
    ...value,
    guidance: accepted
      ? guidance as HospitalGuidanceState
      : { enabled: false, prospectiveOnly: true },
  }
}

export function createPediatricClinicalRulesRepository(input: {
  fetchRules: () => Promise<PediatricClinicalRulesResponse>
  storage: ClinicalRulesSnapshotStorage
}) {
  const source = createClinicalRulesSnapshotRepository({
    cacheKey: `${CLINICAL_RULES_CACHE_PREFIX}:test:PEDIATRIC`,
    ...input,
  })
  return {
    async load(options: { force?: boolean } = {}): Promise<PediatricClinicalRulesSnapshot> {
      return failClosedGuidance(await source.load(options))
    },
    clear: source.clear,
  }
}

async function currentUserId(): Promise<string> {
  const payload = decodeTokenPayload(await getToken())
  return typeof payload?.id === "string" ? payload.id : "unknown"
}

function repository(
  userId: string,
  mode: ClinicalRuleMode,
) {
  const source = createClinicalRulesSnapshotRepository({
    cacheKey: `${CLINICAL_RULES_CACHE_PREFIX}:${userId}:${mode}`,
    fetchRules: () => apiJson<PediatricClinicalRulesResponse>(
      `/api/clinical/rules/runtime?mode=${mode}`,
      { timeoutMs: 8000 },
    ),
    storage: clinicalSyncKv,
  })
  return {
    async load(options: { force?: boolean } = {}): Promise<PediatricClinicalRulesSnapshot> {
      return failClosedGuidance(await source.load(options))
    },
    clear: source.clear,
  }
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
  const [snapshot, setSnapshot] = useState<PediatricClinicalRulesSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void currentUserId()
      .then(userId => repository(userId, mode).load({ force: true }))
      .then(value => {
        if (!cancelled) {
          setSnapshot(value)
          setError(null)
        }
      })
      .catch(reason => {
        if (!cancelled) {
          setSnapshot(null)
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
    snapshot,
    loading,
    error,
    refresh: () => setRefreshToken(value => value + 1),
  }
}

export function usePediatricClinicalRules(enabled: boolean) {
  return useClinicalRules("PEDIATRIC", enabled)
}
