// Thin adapter: the queue implementation lives in @lospor/core/sync (shared
// with the web app). This file keeps the historical import path stable.
export { createSingleFlightQueue, type SingleFlightQueue } from "@lospor/core/sync"
