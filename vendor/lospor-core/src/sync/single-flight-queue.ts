// Strict FIFO promise queue: operations run one at a time in enqueue order,
// a failed operation never blocks the next one. Moved verbatim from
// lospor-mobile (v4.1.x) — this is the primitive every save path builds on.

export type SingleFlightQueue = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>
  idle: () => Promise<void>
}

export function createSingleFlightQueue(): SingleFlightQueue {
  let current: Promise<void> = Promise.resolve()

  return {
    enqueue<T>(operation: () => Promise<T>): Promise<T> {
      const run = current.catch(() => {}).then(operation)
      current = run.then(() => undefined, () => undefined)
      return run
    },
    idle(): Promise<void> {
      return current.catch(() => {})
    },
  }
}
