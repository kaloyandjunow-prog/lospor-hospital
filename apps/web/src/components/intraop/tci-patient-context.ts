"use client"

import { createContext, useContext } from "react"
import type { TciPatient } from "@lospor/core/tci"

/**
 * The patient a TCI model is worked out for (2026-10-18): age, weight,
 * height and sex from the preoperative record, null when any is missing.
 * Provided by the timetable so its flyouts, dialogs and totals read the same
 * patient without each being handed it.
 */
export const TciPatientContext = createContext<TciPatient | null>(null)

export const useTciPatient = () => useContext(TciPatientContext)
