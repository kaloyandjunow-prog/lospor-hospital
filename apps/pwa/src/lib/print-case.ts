import * as Linking from "expo-linking"
import { apiJson } from "@/lib/api"

type PrintableRecordLink = {
  url?: unknown
  format?: unknown
  action?: unknown
}

// Opens the appliance's authorized printable HTML record in the device
// browser. LOSPOR Hospital 1.0.0 does not download or generate a PDF on the
// server. The clinician uses the browser's Print command and may choose "Save
// as PDF" only when the device itself offers that destination.
//
// `doc: "preop-summary"` opens the preop summary (and consent) page instead,
// with layout C's ticked techniques in `techniques` (1.6.0). The case code
// is accepted for the upstream call shape; the HTML page names the case itself.
export async function openPrintCase(
  caseId: string,
  lang?: string,
  _caseCode?: string | null,
  options: { doc?: "preop-summary"; techniques?: readonly string[] } = {},
): Promise<boolean> {
  try {
    const result = await apiJson<PrintableRecordLink>(
      `/api/cases/${encodeURIComponent(caseId)}/print-token`,
      {
        method: "POST",
        body: JSON.stringify({
          lang: lang === "bg" ? "bg" : "en",
          ...(options.doc ? { doc: options.doc } : {}),
          // Sent even when empty, so "nothing ticked" is not read as the planned anaesthesia.
          ...(options.techniques ? { techniques: [...options.techniques] } : {}),
        }),
      },
    )
    if (result.format !== "html" || result.action !== "print" || typeof result.url !== "string") {
      return false
    }

    const target = new URL(result.url)
    if (!/^https?:$/.test(target.protocol)) return false
    await Linking.openURL(target.toString())
    return true
  } catch {
    return false
  }
}
