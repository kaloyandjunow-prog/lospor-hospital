import { fileToBase64 } from "./file-to-base64"

/** The longest side sent: enough for small print, well under the 10 MB limit. */
const MAX_SIDE = 3000

/**
 * A photo as upright JPEG pixels, ready for an AI scan (10.4.1).
 *
 * A phone stores a portrait photo with its pixels sideways and an EXIF tag that
 * says how to turn it. The AI provider ignores the tag, so a lab report arrived
 * at 90 degrees and its values were paired with the wrong rows (2026-11-14:
 * WBC 19 for 34.57, MCV 74 for 89). The browser applies the tag when it decodes
 * (`imageOrientation: "from-image"`); drawing that into a canvas and encoding
 * it again gives pixels that are upright with no tag. Re-encoding also drops
 * the rest of the EXIF block, the location the phone recorded included.
 *
 * Falls back to the file as it is when the browser cannot decode it.
 */
export async function uprightImageBase64(file: Blob & { type: string }): Promise<{ imageBase64: string; mimeType: string }> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") throw new Error("no canvas")
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext("2d")
    if (!context) throw new Error("no 2d context")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9))
    if (!blob) throw new Error("encode failed")
    return { imageBase64: await fileToBase64(blob as File), mimeType: "image/jpeg" }
  } catch {
    return { imageBase64: await fileToBase64(file as File), mimeType: file.type }
  }
}
