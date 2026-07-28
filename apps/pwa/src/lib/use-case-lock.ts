import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, type AppStateStatus } from "react-native"
import * as SecureStore from "expo-secure-store"
import {
  CASE_LOCK_HEARTBEAT_MS,
  CaseLockLease,
  type CaseLockState,
  type CaseLockTransport,
  type CaseLockWireResult,
} from "@lospor/core/sync"
import { apiFetch } from "@/lib/api"
import { randomHex } from "@/lib/random-id"

export type LockState = "idle" | "acquiring" | "held" | "watching"

const DEVICE_ID_KEY = "lospor_device_id"

async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY)
  if (!id) {
    id = `mob-${randomHex(16)}`
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id)
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

function mobileLockTransport(): CaseLockTransport {
  const request = async (
    method: "POST" | "PATCH",
    caseId: string,
    deviceId: string,
  ): Promise<CaseLockWireResult> => readWireResult(await apiFetch(`/api/cases/${caseId}/lock`, {
    method,
    body: JSON.stringify({ deviceId }),
  }))

  return {
    acquire: ({ caseId, deviceId }) => request("POST", caseId, deviceId),
    heartbeat: ({ caseId, deviceId }) => request("PATCH", caseId, deviceId),
    async release({ caseId, deviceId, force }) {
      const response = await apiFetch(`/api/cases/${caseId}/lock`, {
        method: "DELETE",
        body: JSON.stringify(force ? { force: true } : { deviceId }),
      })
      if (!response.ok) throw new Error(`Lock release failed (${response.status})`)
    },
  }
}

export function useCaseLock(caseId: string, enabled = true): {
  lockState: LockState
  isWatching: boolean
  takeover: () => Promise<void>
} {
  const [lockState, setLockState] = useState<LockState>("idle")
  const leaseRef = useRef<CaseLockLease | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

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
    if (!enabled) { setLockState("idle"); return }

    let disposed = false
    let unsubscribe = () => {}

    void getDeviceId().then(deviceId => {
      if (disposed) return
      const lease = new CaseLockLease(caseId, deviceId, mobileLockTransport())
      leaseRef.current = lease
      unsubscribe = lease.subscribe(state => {
        if (!disposed) setLockState(legacyState(state))
      })
      void lease.acquire().then(state => {
        if (!disposed && state.status !== "locked") startHeartbeat()
      })
    })

    const subscription = AppState.addEventListener("change", nextState => {
      const wasActive = appStateRef.current === "active"
      const isActive = nextState === "active"
      appStateRef.current = nextState
      if (wasActive && !isActive) {
        stopHeartbeat()
      } else if (!wasActive && isActive) {
        const lease = leaseRef.current
        if (!lease) return
        void lease.acquire().then(state => {
          if (!disposed && state.status !== "locked") startHeartbeat()
        })
      }
    })

    return () => {
      disposed = true
      subscription.remove()
      unsubscribe()
      stopHeartbeat()
      const lease = leaseRef.current
      leaseRef.current = null
      if (lease) void lease.release()
    }
  }, [caseId, enabled, startHeartbeat, stopHeartbeat])

  const takeover = useCallback(async () => {
    const lease = leaseRef.current
    if (!lease) return
    stopHeartbeat()
    const state = await lease.takeover()
    if (state.status !== "locked") startHeartbeat()
  }, [startHeartbeat, stopHeartbeat])

  return { lockState, isWatching: lockState === "watching", takeover }
}
