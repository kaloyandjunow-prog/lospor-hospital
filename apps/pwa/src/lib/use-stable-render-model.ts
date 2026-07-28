import { useRef } from "react"

type UnknownFunction = (...args: unknown[]) => unknown
type CallbackHolder = {
  target: UnknownFunction
  proxy: UnknownFunction
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isRefObject(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, "current")
}

function stableValue(
  next: unknown,
  previous: unknown,
  path: string,
  callbacks: Map<string, CallbackHolder>,
): unknown {
  if (typeof next === "function") {
    const target = next as unknown as UnknownFunction
    const existing = callbacks.get(path)
    if (existing) {
      existing.target = target
      return existing.proxy
    }
    const holder: CallbackHolder = {
      target,
      proxy: (...args: unknown[]) => holder.target(...args),
    }
    callbacks.set(path, holder)
    return holder.proxy
  }

  if (!isRecord(next) || isRefObject(next)) return next

  const previousRecord = isRecord(previous) ? previous : undefined
  const keys = Object.keys(next)
  const previousKeys = previousRecord ? Object.keys(previousRecord) : []
  let changed = !previousRecord || keys.length !== previousKeys.length
  const result: Record<string, unknown> = {}

  for (const key of keys) {
    const child = stableValue(
      next[key],
      previousRecord?.[key],
      path ? `${path}.${key}` : key,
      callbacks,
    )
    result[key] = child
    if (!previousRecord || !Object.is(previousRecord[key], child)) changed = true
  }

  return changed ? result : previousRecord
}

export function createStableRenderModel<T>() {
  const callbacks = new Map<string, CallbackHolder>()
  let previous: T | undefined

  return {
    update(next: T): T {
      previous = stableValue(next, previous, "", callbacks) as T
      return previous
    },
  }
}

export function useStableRenderModel<T>(next: T): T {
  const modelRef = useRef<ReturnType<typeof createStableRenderModel<T>> | null>(null)
  if (!modelRef.current) modelRef.current = createStableRenderModel<T>()
  return modelRef.current.update(next)
}
