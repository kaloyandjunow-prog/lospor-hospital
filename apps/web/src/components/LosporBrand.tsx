import Link from "next/link"

export function BrandBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[72vh] max-h-[720px] w-[min(760px,96vw)] opacity-90"
      style={{
        clipPath: "polygon(38% 0, 62% 0, 88% 100%, 12% 100%)",
        background:
          "linear-gradient(to bottom, rgba(246,173,47,.16), rgba(246,173,47,.035) 45%, transparent 100%)",
      }}
    />
  )
}

export function LosporBrand({
  compact = false,
  linked = false,
}: {
  compact?: boolean
  linked?: boolean
}) {
  const content = (
    <div className={`flex items-center ${compact ? "gap-3" : "flex-col text-center"}`}>
      <div className={compact ? "h-12 w-12" : "h-28 w-28"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lospor-symbol-light.svg" alt="" className="h-full w-full dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lospor-symbol-dark.svg" alt="" className="hidden h-full w-full dark:block" />
      </div>
      <div className={compact ? "" : "-mt-1"}>
        <div className={`${compact ? "text-xl" : "text-4xl"} font-bold text-slate-900 dark:text-[#f7f8f5]`}>
          LOSPOR
        </div>
        {!compact && (
          <div className="mt-1 text-[10px] font-medium text-[#9c6200] dark:text-[#f6ad2f] sm:text-xs">
            LARGE OPEN SOURCE PERIOPERATIVE REGISTER
          </div>
        )}
      </div>
    </div>
  )

  return linked ? (
    <Link href="/login" aria-label="LOSPOR home" className="inline-block transition-opacity hover:opacity-80">
      {content}
    </Link>
  ) : content
}
