"use client"

import { createContext, useContext } from "react"
import type { LikelyEvent } from "@lospor/core/event-succession"

/**
 * What the event selector needs from the case that the timetable does not hold (10.2.0): whether it is the new list
 * or the Legacy buttons, and the events likely to come next. The form that holds the case provides it; outside a
 * form the selector is the new list with nothing likely.
 */
export type EventSelectorState = {
  screen: "smart" | "legacy"
  likely: readonly LikelyEvent[]
  /** The exact succession automation id, persisted as a case answer. */
  dismiss: (suggestionId: string) => void
}

const DEFAULT: EventSelectorState = { screen: "smart", likely: [], dismiss: () => {} }

export const EventSelectorContext = createContext<EventSelectorState>(DEFAULT)

export const useEventSelector = (): EventSelectorState => useContext(EventSelectorContext)
