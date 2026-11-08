import { useEffect, useRef, type MutableRefObject } from "react"

/**
 * The newest value of something, readable from a timer or an effect that must not restart when it changes.
 *
 * A callback passed down as an inline arrow is a new function on every render of its parent. Listing it among an
 * effect's dependencies restarts the effect every time, which for an autosave timer meant a save, a state change in
 * the parent, a new callback and another save, about once every second and a half on a case left open (11.0).
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => { ref.current = value })
  return ref
}
