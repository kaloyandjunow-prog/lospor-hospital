/**
 * Read a browser File into base64, without the data-URL prefix.
 *
 * Nothing here is lab-specific; it lived inside LabResults only because that
 * was the first component to photograph something. Kept out of Core
 * deliberately — `FileReader` is a browser API, and Core stays runtime-neutral
 * so the API and the native app can both use it.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(",")[1] ?? "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
