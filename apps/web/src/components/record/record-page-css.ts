/**
 * The page rules of the record: portrait pages for the log and the closing sheet, one landscape page for the
 * timetable, a footer with the hospital and "page N of M". On screen the sheets are paper-width columns.
 */
const cssString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")

export function recordPageCss(hospital: string, page: string, of: string): string {
  const footer = `"${cssString(hospital)} · ${cssString(page)} " counter(page) " ${cssString(of)} " counter(pages)`
  return `
    .record-root { color-scheme: only light; }
    .rec-sheet { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin: 0 auto 12px; }
    .rec-port { max-width: 794px; }
    .rec-land { max-width: 1123px; }
    .rec-flow { break-inside: auto; }
    .rec-h { break-after: avoid; }
    .rec-log tr, .record-root table tr { break-inside: avoid; }
    .rec-log thead { display: table-header-group; }
    @media print {
      @page { size: A4; margin: 12mm 0 14mm 0; @bottom-center { content: ${footer}; font: 9px system-ui, sans-serif; color: #64748b; } }
      @page rec-land { size: A4 landscape; margin: 9mm 0 12mm 0; @bottom-center { content: ${footer}; font: 9px system-ui, sans-serif; color: #64748b; } }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      /* Pages of different sizes are only laid out at their own width when every ancestor is a plain block. */
      html:has(.record-root), body:has(.record-root), div:has(.record-root) { display: block !important; height: auto !important; min-height: 0 !important; overflow: visible !important; max-width: none !important; width: auto !important; padding: 0 !important; margin: 0 !important; zoom: 1 !important; }
      .record-root { background: #fff; }
      .rec-sheet { border: 0; border-radius: 0; margin: 0; padding: 0 12mm; max-width: none; }
      .rec-land { page: rec-land; break-before: page; }
      .rec-end { break-before: page; }
      .rec-sheet .tabular-nums { font-variant-numeric: tabular-nums; }
    }
  `
}
