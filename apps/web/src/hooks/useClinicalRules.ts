"use client"

import { useEffect, useState } from "react"
import {
  createClinicalRulesSnapshotRepository,
  type ClinicalRuleMode,
  type ClinicalRulesRuntimeSnapshot,
} from "@lospor/core/clinical-rules"
import {
  evaluateClinicalBaseline,
  type ClinicalBaselineFailure,
} from "@/lib/clinical-baseline-safety"

const USER_KEY = "lospor:clinical-rules:last-user"
const CACHE_ROOT = "lospor:clinical-rules:"
// v5 stores only runtime bundles normalized from validated effective rules.
// Older caches could contain transport profile arrays that bypassed the
// governed selected-baseline readiness checks.
const CACHE_PREFIX = "lospor:clinical-rules:v5"

const storage = {
  async get(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  async set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // The fresh response remains usable for this browser session.
    }
  },
  async delete(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Nothing else to clear.
    }
  },
}

async function currentUserId(): Promise<string> {
  let cached = "unknown"
  try {
    cached = localStorage.getItem(USER_KEY) || cached
  } catch {
    // Private browsing can deny storage access.
  }
  try {
    const response = await fetch("/api/user", {
      cache: "no-store",
      credentials: "same-origin",
    })
    const body = await response.json().catch(() => ({}))
    const id = typeof body.id === "string" ? body.id : cached
    if (id !== "unknown") localStorage.setItem(USER_KEY, id)
    return id
  } catch {
    return cached
  }
}

function repository(cacheKey: string, mode: ClinicalRuleMode) {
  return createClinicalRulesSnapshotRepository({
    cacheKey,
    fetchRules: async () => {
      const response = await fetch(`/api/clinical/rules/runtime?mode=${mode}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error ?? "Clinical rules unavailable")
      }
      return evaluateClinicalBaseline(body, mode).bundle
    },
    storage,
  })
}

export async function clearClinicalRulesCache() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter((key): key is string => !!key && key.startsWith(CACHE_ROOT))
    for (const key of keys) localStorage.removeItem(key)
    localStorage.removeItem(USER_KEY)
  } catch {
    // Nothing else to clear.
  }
}

export function useClinicalRules(mode: ClinicalRuleMode, enabled = true) {
  const [result, setResult] = useState<{
    mode: ClinicalRuleMode | null
    snapshot: ClinicalRulesRuntimeSnapshot | null
    prospectiveGuidanceEnabled: boolean
    baselineFailure: ClinicalBaselineFailure
    error: string | null
  }>({
    mode: null,
    snapshot: null,
    prospectiveGuidanceEnabled: false,
    baselineFailure: "MISSING",
    error: null,
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void currentUserId()
      .then(userId => repository(`${CACHE_PREFIX}:${userId}:${mode}`, mode).load({ force: true }))
      .then(value => {
        if (!cancelled) {
          const evaluated = evaluateClinicalBaseline(value, mode)
          setResult({
            mode,
            snapshot: {
              ...evaluated.bundle,
              source: value.source,
              cachedAt: value.cachedAt,
            },
            prospectiveGuidanceEnabled: evaluated.prospectiveGuidanceEnabled,
            baselineFailure: evaluated.failure,
            error: null,
          })
        }
      })
      .catch(reason => {
        if (!cancelled) {
          setResult({
            mode,
            snapshot: null,
            prospectiveGuidanceEnabled: false,
            baselineFailure: "MISSING",
            error: reason instanceof Error ? reason.message : "Clinical rules unavailable",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, mode])

  const current = enabled && result.mode === mode
  const snapshot = current ? result.snapshot : null
  const error = current ? result.error : null
  const loading = enabled && !snapshot && !error
  return {
    snapshot,
    loading,
    error,
    prospectiveGuidanceEnabled: current && result.prospectiveGuidanceEnabled,
    baselineFailure: current ? result.baselineFailure : "MISSING" as const,
  }
}
