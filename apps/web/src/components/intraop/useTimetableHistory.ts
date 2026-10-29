"use client"

import { useRef, useState, type RefObject } from "react"

export function useTimetableHistory<T>(dataRef: RefObject<T>, rawOnChangeRef: RefObject<(data: T) => void>) {
  const pastRef = useRef<T[]>([])
  const futureRef = useRef<T[]>([])
  const [depth, setDepth] = useState({ past: 0, future: 0 })
  const sync = () => setDepth({ past: pastRef.current.length, future: futureRef.current.length })
  const onChangeRef = useRef((next: T) => {
    if (dataRef.current) pastRef.current = [...pastRef.current.slice(-99), dataRef.current]
    futureRef.current = []
    sync()
    rawOnChangeRef.current(next)
  })
  const undoRef = useRef(() => {
    const previous = pastRef.current.pop()
    if (previous) { futureRef.current.push(dataRef.current); rawOnChangeRef.current(previous) }
    sync()
  })
  const redoRef = useRef(() => {
    const next = futureRef.current.pop()
    if (next) { pastRef.current.push(dataRef.current); rawOnChangeRef.current(next) }
    sync()
  })
  return { onChangeRef, undoRef, redoRef, depth }
}
