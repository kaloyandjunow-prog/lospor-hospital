"use client"

import { useEffect, useState } from "react"
import { CLINICAL_RANGES, type ClinicalRangeKey } from "@lospor/core"
import {
  CLINICAL_CATALOG_GENERATED_AT,
  bundledOptions,
} from "@lospor/core/catalog"
import {
  isLibraryCategory,
  type LibraryCategory,
} from "@lospor/core/option-contracts"
import {
  rangeSpecFromOption,
  type LibraryOption,
  type RangeSpec,
} from "@lospor/core/option-library"
import {
  OptionLibraryRepository,
  type OptionLibrarySource,
} from "@lospor/core/sync"

export type { LibraryOption, RangeSpec }
export type LibrarySource = OptionLibrarySource

const loadedCategories = new Set<LibraryCategory>()
const settledCategories = new Set<LibraryCategory>()
const globalListeners = new Set<() => void>()

const repository = new OptionLibraryRepository({
  storage: {
    async get(key) {
      if (typeof window === "undefined") return null
      return window.localStorage.getItem(key)
    },
    async set(key, value) {
      if (typeof window !== "undefined") window.localStorage.setItem(key, value)
    },
  },
  async fetchCategory(category) {
    const response = await fetch(`/api/library/${category}`)
    if (!response.ok) throw new Error(`library fetch failed: ${response.status}`)
    return response.json()
  },
  bundled: bundledOptions,
  scheduler: {
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancel: handle => window.clearTimeout(handle as number),
  },
})

export function useOptionLibrary(category: string): {
  options: LibraryOption[]
  loading: boolean
  source: LibrarySource | null
} {
  const validCategory = isLibraryCategory(category) ? category : null
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (!validCategory) return
    loadedCategories.add(validCategory)
    const unsubscribe = repository.subscribe(validCategory, () => {
      forceRender(value => value + 1)
      globalListeners.forEach(listener => listener())
    })
    if (!repository.state(validCategory) && !settledCategories.has(validCategory)) {
      void repository.load(validCategory).finally(() => {
        settledCategories.add(validCategory)
        forceRender(value => value + 1)
      })
    }
    return unsubscribe
  }, [validCategory])

  const latest = validCategory ? repository.state(validCategory) : null
  return {
    options: latest?.data ?? [],
    loading: validCategory != null
      && latest == null
      && !settledCategories.has(validCategory),
    source: latest?.source ?? null,
  }
}

export function useRangeSpec(category: string): RangeSpec | undefined {
  const { options } = useOptionLibrary(category)
  return rangeSpecFromOption(options[0])
}

export function useRange(key: ClinicalRangeKey): RangeSpec {
  const spec = useRangeSpec(key)
  const canonical = CLINICAL_RANGES[key]
  return spec ?? { ...canonical, unit: canonical.unit }
}

export function useAnyLibraryFallback(): {
  active: boolean
  snapshotDate: string
} {
  const [, forceRender] = useState(0)
  useEffect(() => {
    const callback = () => forceRender(value => value + 1)
    globalListeners.add(callback)
    return () => {
      globalListeners.delete(callback)
    }
  }, [])
  return {
    active: [...loadedCategories].some(category =>
      repository.state(category)?.source !== "live",
    ),
    snapshotDate: CLINICAL_CATALOG_GENERATED_AT,
  }
}
