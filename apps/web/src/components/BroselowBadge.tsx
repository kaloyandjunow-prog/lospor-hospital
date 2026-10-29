import { broselowLabel, type BroselowResult } from "@lospor/core/broselow"

/**
 * The child's Broselow tape colour, as a pill in that colour carrying its name.
 *
 * The colour is the tape's own, so it does not follow the light or dark
 * theme, and it asks the printer to keep it. The name always accompanies it:
 * a sheet printed in black and white, or read by someone who cannot tell the
 * colours apart, still says which zone it is.
 */
export function BroselowBadge({
  result,
  language,
  label,
  basis,
  size = "md",
}: {
  result: BroselowResult
  language: string
  /** The word for the tape itself, in the reader's language. */
  label: string
  /** "by height" / "by weight", shown small beside the name. */
  basis?: string
  size?: "sm" | "md"
}) {
  const { zone } = result
  const small = size === "sm"
  return (
    <span
      className="inline-flex items-center gap-1.5 align-middle"
      data-testid="broselow-badge"
      data-zone={zone.key}
    >
      <span
        className={`rounded px-1.5 font-bold ${small ? "text-[10.5px] leading-[16px]" : "text-xs leading-5"}`}
        style={{
          backgroundColor: zone.hex,
          color: zone.textHex,
          border: "1px solid rgba(100,116,139,0.6)",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      >
        {label} {broselowLabel(zone, language)}
      </span>
      {basis ? <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">{basis}</span> : null}
    </span>
  )
}
