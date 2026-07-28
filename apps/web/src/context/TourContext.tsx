"use client"

import { createContext, useContext } from "react"

export type TourId = "dashboard" | "preop" | "intraop" | "postop" | "summary"

interface TourContextValue {
  startTour:           (tourId?: TourId) => void
  currentFormStep:     number | null
  setCurrentFormStep:  (step: number | null) => void
}

export const TourContext = createContext<TourContextValue>({
  startTour:          () => {},
  currentFormStep:    null,
  setCurrentFormStep: () => {},
})

export function useTour() {
  return useContext(TourContext)
}
