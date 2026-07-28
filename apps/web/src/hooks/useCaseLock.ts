"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  CASE_LOCK_HEARTBEAT_MS,
  CaseLockLease,
  type CaseLockState,
  type CaseLockTransport,
  type CaseLockWireResult,
} from "@lospor/core/sync"

export type LockState = "idle" | "acquiring" | "held" | "watching"

function getDeviceId(): string {
  if (typeof window === "undefined") return ""
  let id = localStorage.getItem("lospor_device_id")
  if (!id) {
    id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map(byte => byte.toString(16).padStart(2, "0"))
          .join("")
    localStorage.setItem("lospor_device_id", id)
  }
  return id
}

function legacyState(state: CaseLockState): LockState {
  if (state.status === "acquiring") return "acquiring"
  if (state.status === "locked") return "watching"
  if (state.status === "owned" || state.status === "unavailable") return "held"
  return "idle"
}

async function readWireResult(response: Response): Promise<CaseLockWireResult> {
  const body = await response.json().catch(() => ({})) as CaseLockWireResult
  if (response.status === 409) return { ...body, acquired: false, locked: true }
  if (!response.ok) throw new Error(`Lock request failed (${response.status})`)
  return { ...body, acquired: true, locked: false }
}

function webLockTransport(): CaseLockTransport {
  const request = async (
    method: "POST" | "PATCH",
    caseId: string,
    deviceId: string,
  ): Promise<CaseLockWireResult> => readWireResult(await fetch(`/api/cases/${caseId}/lock`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  }))

  return {
    acquire: ({ caseId, deviceId }) => request("POST", caseId, deviceId),
    heartbeat: ({ caseId, deviceId }) => request("PATCH", caseId, deviceId),
    async release({ caseId, deviceId, force }) {
      const response = await fetch(`/api/cases/${caseId}/lock`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(force ? { force: true } : { deviceId }),
        keepalive: true,
      })
      if (!response.ok) throw new Error(`Lock release failed (${response.status})`)
    },
  }
}

export function useCaseLock(caseId: string | null, enabled = true): {
  lockState: LockState
  isWatching: boolean
  holderName: string | null
  takeover: () => Promise<void>
} {
  const [lockState, setLockState] = useState<LockState>("idle")
  const [holderName, setHolderName] = useState<string | null>(null)
  const leaseRef = useRef<CaseLockLease | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = null
  }, [])

  const startHeartbeat = useCallback(() => {
    stopHeartbeat()
    heartbeatRef.current = setInterval(() => {
      const lease = leaseRef.current
      if (!lease) return
      if (lease.state().status === "unavailable") void lease.acquire()
      else void lease.heartbeat()
    }, CASE_LOCK_HEARTBEAT_MS)
  }, [stopHeartbeat])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!caseId || !enabled) { setLockState("idle"); return }

    let disposed = false
    const lease = new CaseLockLease(caseId, getDeviceId(), webLockTransport())
    leaseRef.current = lease
    const unsubscribe = lease.subscribe(state => {
      if (disposed) return
      setLockState(legacyState(state))
      setHolderName(state.holder?.holderName ?? null)
    })

    void lease.acquire().then(state => {
      if (!disposed && state.status !== "locked") startHeartbeat()
    })

    const release = () => {
      stopHeartbeat()
      void lease.release()
    }
    window.addEventListener("beforeunload", release)

    return () => {
      disposed = true
      window.removeEventListener("beforeunload", release)
      unsubscribe()
      release()
      if (leaseRef.current === lease) leaseRef.current = null
    }
  }, [caseId, enabled, startHeartbeat, stopHeartbeat])

  const takeover = useCallback(async () => {
    const lease = leaseRef.current
    if (!lease) return
    stopHeartbeat()
    const state = await lease.takeover()
    if (state.status !== "locked") startHeartbeat()
  }, [startHeartbeat, stopHeartbeat])

  return { lockState, isWatching: lockState === "watching", holderName, takeover }
}
