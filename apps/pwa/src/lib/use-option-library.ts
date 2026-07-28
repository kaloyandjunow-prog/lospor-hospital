import { useEffect, useState } from "react"
import * as SecureStore from "expo-secure-store"
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
import { apiJson } from "./api"

export type { LibraryOption, RangeSpec }
export type LibrarySource = OptionLibrarySource

const loadedCategories = new Set<LibraryCategory>()
const globalListeners = new Set<() => void>()

const repository = new OptionLibraryRepository({
  storage: {
    get: key => SecureStore.getItemAsync(key),
    set: (key, value) => SecureStore.setItemAsync(key, value),
    delete: key => SecureStore.deleteItemAsync(key),
  },
  fetchCategory: category => apiJson<unknown>(`/api/library/${category}`),
  bundled: bundledOptions,
  scheduler: {
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
})

export function useOptionLibrary(category: string): {
  options: LibraryOption[]
  loading: boolean
  source: LibrarySource | null
} {
  const validCategory = isLibraryCategory(category) ? category : null
  const [, forceRender] = useState(0)
  const [loading, setLoading] = useState(
    validCategory ? repository.state(validCategory) === null : false,
  )

  useEffect(() => {
    if (!validCategory) {
      setLoading(false)
      return
    }
    loadedCategories.add(validCategory)
    const unsubscribe = repository.subscribe(validCategory, () => {
      forceRender(value => value + 1)
      globalListeners.forEach(listener => listener())
    })
    if (!repository.state(validCategory)) {
      setLoading(true)
      void repository.load(validCategory).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return unsubscribe
  }, [validCategory])

  const latest = validCategory ? repository.state(validCategory) : null
  return {
    options: latest?.data ?? [],
    loading,
    source: latest?.source ?? null,
  }
}

export function useRangeSpec(category: string): RangeSpec | undefined {
  const { options } = useOptionLibrary(category)
  return rangeSpecFromOption(options[0])
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
