import type { AcceptanceTrendView } from "./control-plane.js"

const series = (pairs: Array<[number, number]>) => pairs.map(([accepted, dismissed]) => ({ accepted, dismissed }))

/** Twelve months to 2026-11: a card that is taken and fading, and a question nobody takes. */
export function acceptanceFixture(): AcceptanceTrendView {
  const months = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]
  return {
    months,
    cases: [40, 42, 38, 45, 50, 47, 44, 41, 39, 52, 55, 20],
    byId: {
      "card:Hypotension": series([[8, 2], [9, 1], [8, 2], [7, 3], [8, 2], [6, 4], [5, 5], [4, 6], [3, 7], [2, 8], [2, 8], [1, 3]]),
      "reverse:adenosine": series([[0, 4], [0, 3], [1, 5], [0, 6], [0, 4], [0, 5], [0, 4], [0, 6], [0, 3], [0, 5], [0, 4], [0, 2]]),
      "reminder:latex": series([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]),
    },
  }
}
