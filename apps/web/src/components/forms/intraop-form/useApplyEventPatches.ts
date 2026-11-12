import { useCallback } from "react"
import type { UseFormSetValue } from "react-hook-form"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { formPatchFromEventOps } from "@/lib/event-patch-form"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

/**
 * Saving an answer from the timeline's suggestions writes an event whose patch the server applies at once; this puts
 * the same values into the form in the same moment, so the sidebar, the readiness check and the next suggestion see
 * the answer instead of the old state (see event-patch-form.ts). Returns `onEventOps` with that added.
 */
export function useApplyEventPatches(
  setValue: UseFormSetValue<IntraopFormFields>,
  onEventOps: ((ops: IntraopEventOps) => void | Promise<void>) | undefined,
): ((ops: IntraopEventOps) => void | Promise<void>) | undefined {
  const apply = useCallback((ops: IntraopEventOps) => {
    for (const [field, value] of Object.entries(formPatchFromEventOps(ops))) {
      setValue(field as keyof IntraopFormFields, value as never, { shouldDirty: true })
    }
    return onEventOps?.(ops)
  }, [onEventOps, setValue])
  return onEventOps ? apply : undefined
}
