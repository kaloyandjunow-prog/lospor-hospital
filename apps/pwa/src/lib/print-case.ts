import * as FileSystem from "expo-file-system/legacy"
import * as Sharing from "expo-sharing"
import { apiUrl, getToken } from "@/lib/api"

// Fully native "Print case": the app downloads the finished-case A4 PDF itself
// (bearer-authorized — no browser, no web app, no print token) and hands the
// file to Android's share/open sheet: view it in a PDF app, save, send, or
// print. Used by the case-detail Print button, the dashboard long-press menu,
// and the "case finished" prompt. Returns false on any failure so callers can
// show an error toast — there is deliberately NO browser fallback.
export async function openPrintCase(caseId: string, lang?: string, caseCode?: string | null): Promise<boolean> {
  try {
    const token = await getToken()
    if (!token) return false

    const safeName = (caseCode ?? "case").replace(/[^A-Za-z0-9_-]+/g, "-")
    const target = `${FileSystem.cacheDirectory}${safeName}-record.pdf`
    const url = apiUrl(`/api/cases/${caseId}/pdf?lang=${lang === "bg" ? "bg" : "en"}`)

    const res = await FileSystem.downloadAsync(url, target, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status !== 200) return false

    if (!(await Sharing.isAvailableAsync())) return false
    await Sharing.shareAsync(res.uri, {
      mimeType: "application/pdf",
      dialogTitle: `${caseCode ?? "Case"} — PDF`,
    })
    return true
  } catch {
    return false
  }
}
