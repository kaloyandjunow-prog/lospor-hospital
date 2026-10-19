import { useEffect, useState } from "react"
import { DEFAULT_PREOP_DOCUMENT_SETTINGS, effectivePreopDocumentSettings, type PreopDocumentSettings } from "@lospor/core/preop-documents"
import { apiFetch } from "@/lib/api"

/**
 * Whether this site uses the preop summary page (and the consent with it),
 * as web's usePreopDocumentSettings. Off until the answer arrives and off
 * offline: a phone that cannot ask keeps the flow it had, preop straight to
 * intraop, which works without a connection.
 */
export function usePreopDocumentSettings(): PreopDocumentSettings {
  const [settings, setSettings] = useState<PreopDocumentSettings>(DEFAULT_PREOP_DOCUMENT_SETTINGS)
  useEffect(() => {
    let cancelled = false
    apiFetch("/api/preop/documents")
      .then(response => response.ok ? response.json() : null)
      .then((body: Partial<PreopDocumentSettings> | null) => { if (!cancelled && body) setSettings(effectivePreopDocumentSettings(body)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return settings
}
