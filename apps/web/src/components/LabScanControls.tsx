"use client"

import { Camera, Loader2, ScanLine } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRef } from "react"
import { capabilityMessageKey, type RuntimeCapability } from "@/lib/deployment-capabilities"

/**
 * The two ways a clinician can hand a lab report to the AI extractor: choose an
 * image file, or take a photograph.
 *
 * Split out of LabResults because that file owns three separate concerns --
 * capture, the extraction preview, and manual entry -- and only this one deals
 * with sending an image off the appliance. Keeping it here means the privacy
 * warning, the file inputs and the disabled-while-scanning state live together
 * instead of being interleaved with the results table.
 *
 * The caller decides whether this is rendered at all. It is shown only when the
 * deployment permits lab-image extraction AND the case has consented to AI,
 * because a lab printout carries the patient's name and EGN in its header and
 * nothing can redact text in an image.
 */
export function LabScanControls({
  loading,
  error,
  onFileSelected,
  capability,
  aiOptIn,
  caseId,
}: {
  loading: boolean
  error: string | null
  onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void
  capability: RuntimeCapability
  aiOptIn: boolean
  caseId?: string | null
}) {
  const t = useTranslations()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // All three reasons the control can be unavailable live here, next to the
  // control itself. Each names its condition rather than silently omitting the
  // feature, so the clinician knows it exists and what would enable it.
  if (!capability.enabled) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t(capabilityMessageKey(capability.reason))}
      </p>
    )
  }
  if (!aiOptIn) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("intraop.lab.scanNeedsAiOptIn")}
      </p>
    )
  }
  // Consented, but no saved case yet, so there is no record for the server to
  // read consent from.
  if (!caseId) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("intraop.lab.scanNeedsSavedCase")}
      </p>
    )
  }

  const button = "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1.5">
          {t("intraop.lab.privacyWarning")}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading} className={button}>
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("intraop.lab.scanning")}</>
              : <><ScanLine className="h-3.5 w-3.5" /> {t("intraop.lab.scanReport")}</>
            }
          </button>
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={loading} className={button}>
            <Camera className="h-3.5 w-3.5" /> {t("intraop.lab.takePicture")}
          </button>
        </div>
        {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
      </div>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFileSelected} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileSelected} />
    </div>
  )
}
