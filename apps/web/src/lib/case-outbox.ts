"use client"

// Compatibility facade. Web screens and settings keep their historical
// imports while the v5.6 Autosave Manager owns the actual outbox.
import {
  autosaveManager,
  isNetworkSaveError,
  onPatchOutboxChange,
} from "./autosave-manager"

export const caseOutbox = autosaveManager.outbox
export const onOutboxChange = onPatchOutboxChange
export { isNetworkSaveError }
