import QRCode from "qrcode"

/** Render locally: no URL or token is sent to a third-party QR service. */
export async function accountLinkQrSvg(url: string): Promise<string | null> {
  if (url.length < 32 || url.length > 4096) return null
  try {
    return await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 248,
      color: { dark: "#111111ff", light: "#ffffffff" },
    })
  } catch {
    return null
  }
}
