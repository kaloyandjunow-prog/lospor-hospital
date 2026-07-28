import { Platform } from "react-native"

const configuredWebOrigin = process.env.EXPO_PUBLIC_HOSPITAL_WEB_URL?.trim()

export function hospitalWebUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  if (configuredWebOrigin) {
    return new URL(normalizedPath, configuredWebOrigin).toString()
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return new URL(normalizedPath, window.location.origin).toString()
  }
  return `https://hospital.lospor.invalid${normalizedPath}`
}
