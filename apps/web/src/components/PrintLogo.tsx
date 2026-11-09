/**
 * The hospital's logo at the top of every printed page (hospital 1.8.0).
 *
 * Fixed on paper only: in print a fixed element repeats on each page, so a
 * summary, a consent that runs over several sheets and the anaesthesia record
 * all carry it without any of them knowing about it. It sits in the page's top
 * margin, which every one of those documents leaves empty. On screen it is not
 * drawn. Only a PNG, JPEG or WebP data URL is accepted; the server checked it too.
 */
const LOGO = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export function hospitalLogoOf(institution: unknown): string | null {
  const value = institution && typeof institution === "object" ? (institution as { logoDataUrl?: unknown }).logoDataUrl : null
  return typeof value === "string" && value.length < 1_500_000 && LOGO.test(value) ? value : null
}

export function PrintLogo({ institution, right = "13mm" }: { institution: unknown; right?: string }) {
  const src = hospitalLogoOf(institution)
  if (!src) return null
  return (
    <>
      <style>{`.print-logo{display:none}@media print{.print-logo{display:block;position:fixed;top:1.5mm;right:${right};height:9mm;max-width:50mm;object-fit:contain;object-position:right center}}`}</style>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL printed as is; there is nothing to optimise */}
      <img className="print-logo" data-testid="print-logo" src={src} alt="" />
    </>
  )
}
