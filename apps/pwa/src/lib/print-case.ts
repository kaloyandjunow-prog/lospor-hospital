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
export async function openPrintCase(caseId: string, lang?: string): Promise<boolean> {
  try {
    const result = await apiJson<PrintableRecordLink>(
      `/api/cases/${encodeURIComponent(caseId)}/print-token`,
      {
        method: "POST",
        body: JSON.stringify({ lang: lang === "bg" ? "bg" : "en" }),
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
