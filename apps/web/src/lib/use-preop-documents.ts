"use client"

import { useEffect, useState } from "react"
import { DEFAULT_PREOP_DOCUMENT_SETTINGS, effectivePreopDocumentSettings, type PreopDocumentSettings } from "@lospor/core/preop-documents"

/**
 * Whether this site uses the preop summary page (and the consent with it).
 * Off until the answer arrives, and off if it never does: a site that cannot
 * be asked keeps the flow it had, straight from preop to intraop.
 */
export function usePreopDocumentSettings(): PreopDocumentSettings {
  const [settings, setSettings] = useState<PreopDocumentSettings>(DEFAULT_PREOP_DOCUMENT_SETTINGS)
  useEffect(() => {
    let cancelled = false
    fetch("/api/preop/documents", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then((body: Partial<PreopDocumentSettings> | null) => { if (!cancelled && body) setSettings(effectivePreopDocumentSettings(body)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return settings
}
