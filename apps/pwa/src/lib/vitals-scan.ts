import { Platform } from "react-native"

export type ScanImageAsset = {
  uri: string
  base64?: string | null
  mimeType?: string | null
  file?: Blob | null
}

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      resolve(typeof result === "string" ? result.split(",")[1] ?? "" : "")
    }
    reader.onerror = () => reject(new Error("Could not read the captured image."))
    reader.readAsDataURL(blob)
  })
}

// Prepares a camera/gallery image for the monitor-scan API: native platforms
// pass through the already-captured base64; web re-encodes via canvas to
// keep the payload under the API's size limit. Used exclusively by the
// vitals "scan from camera" feature (useVitalsEntry).
export async function prepareVitalsScanImage(asset: ScanImageAsset): Promise<{ image: string; mimeType: string }> {
  if (Platform.OS !== "web") {
    if (asset.base64) {
      return { image: asset.base64, mimeType: asset.mimeType || "image/jpeg" }
    }
    const response = await fetch(asset.uri)
    const blob = await response.blob()
    return { image: await readBlobAsBase64(blob), mimeType: blob.type || asset.mimeType || "image/jpeg" }
  }

  const sourceBlob = asset.file instanceof Blob
    ? asset.file
    : await fetch(asset.uri).then(response => response.blob())
  const objectUrl = URL.createObjectURL(sourceBlob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error("Could not decode the captured image."))
      element.src = objectUrl
    })
    const maxDimension = 1600
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Image compression is not available in this browser.")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return {
      image: canvas.toDataURL("image/jpeg", 0.72).split(",")[1] ?? "",
      mimeType: "image/jpeg",
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// Lazy require — expo-image-picker needs a full native build; gracefully degrade.
export function getImagePicker() {
  try { return require("expo-image-picker") } catch { return null }
}
