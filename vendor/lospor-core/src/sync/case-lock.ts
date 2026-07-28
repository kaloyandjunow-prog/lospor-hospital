export const CASE_LOCK_TTL_MS = 30_000
export const CASE_LOCK_HEARTBEAT_MS = 15_000

export type CaseLockHolder = {
  userId?: string
  deviceId?: string
  holderName?: string
  expiresAt?: string
}

export type CaseLockWireResult = {
  acquired?: boolean
  locked?: boolean
  holder?: CaseLockHolder | null
}

export type CaseLockState =
  | { status: "idle"; editable: true; holder: null }
  | { status: "acquiring"; editable: false; holder: null }
  | { status: "owned"; editable: true; holder: CaseLockHolder | null }
  | { status: "locked"; editable: false; holder: CaseLockHolder | null }
  | { status: "unavailable"; editable: true; holder: null }

export type CaseLockTransport = {
  acquire(input: { caseId: string; deviceId: string }): Promise<CaseLockWireResult>
  heartbeat(input: { caseId: string; deviceId: string }): Promise<CaseLockWireResult>
  release(input: { caseId: string; deviceId: string; force?: boolean }): Promise<void>
}

export class CaseLockLease {
  private current: CaseLockState = { status: "idle", editable: true, holder: null }
  private readonly listeners = new Set<(state: CaseLockState) => void>()

  constructor(
    private readonly caseId: string,
    private readonly deviceId: string,
    private readonly transport: CaseLockTransport,
  ) {}

  state(): CaseLockState {
    return this.current
  }

  subscribe(listener: (state: CaseLockState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async acquire(): Promise<CaseLockState> {
    this.set({ status: "acquiring", editable: false, holder: null })
    try {
      return this.applyWire(await this.transport.acquire({
        caseId: this.caseId,
        deviceId: this.deviceId,
      }))
    } catch {
      return this.set({ status: "unavailable", editable: true, holder: null })
    }
  }

  async heartbeat(): Promise<CaseLockState> {
    if (this.current.status !== "owned") return this.current
    try {
      return this.applyWire(await this.transport.heartbeat({
        caseId: this.caseId,
        deviceId: this.deviceId,
      }))
    } catch {
      return this.set({ status: "unavailable", editable: true, holder: null })
    }
  }

  async takeover(): Promise<CaseLockState> {
    try {
      await this.transport.release({
        caseId: this.caseId,
        deviceId: this.deviceId,
        force: true,
      })
      return this.acquire()
    } catch {
      return this.set({ status: "unavailable", editable: true, holder: null })
    }
  }

  async release(): Promise<void> {
    try {
      await this.transport.release({ caseId: this.caseId, deviceId: this.deviceId })
    } finally {
      this.set({ status: "idle", editable: true, holder: null })
    }
  }

  private applyWire(result: CaseLockWireResult): CaseLockState {
    if (result.acquired === true || result.locked === false) {
      return this.set({ status: "owned", editable: true, holder: result.holder ?? null })
    }
    return this.set({ status: "locked", editable: false, holder: result.holder ?? null })
  }

  private set(state: CaseLockState): CaseLockState {
    this.current = state
    this.listeners.forEach(listener => listener(state))
    return state
  }
}
