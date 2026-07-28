import "../global.css"
import { Slot, useRouter, useSegments } from "expo-router"
import { useEffect, useState } from "react"
import { Text, TextInput } from "react-native"
import { useFonts } from "expo-font"
import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
  Roboto_900Black,
} from "@expo-google-fonts/roboto"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { useQueuedSaveFlusher } from "@/lib/use-queued-save-flusher"
import { PreferencesProvider } from "@/lib/preferences-context"
import { configureForeground } from "@/lib/notifications"
import { BootAnimation } from "@/components/BootAnimation"
import { ActionSheetHost } from "@/components/ActionSheetHost"

const appFontFamily = "Roboto_400Regular"
let defaultFontApplied = false

function applyDefaultFont() {
  if (defaultFontApplied) return
  defaultFontApplied = true

  try {
    const text = Text as unknown as { defaultProps?: { style?: unknown } }
    const input = TextInput as unknown as { defaultProps?: { style?: unknown } }

    text.defaultProps = text.defaultProps ?? {}
    text.defaultProps.style = [{ fontFamily: appFontFamily }, text.defaultProps.style]

    input.defaultProps = input.defaultProps ?? {}
    input.defaultProps.style = [{ fontFamily: appFontFamily }, input.defaultProps.style]
  } catch {
    // Some React Native runtimes lock host components; loading still keeps Roboto available.
  }
}

function Guard() {
  const { state } = useAuth()
  const segments = useSegments()
  const router = useRouter()
  useQueuedSaveFlusher(state === "authenticated")

  useEffect(() => {
    if (state === "loading") return
    const inAuth = segments[0] === "(auth)"
    if (state === "unauthenticated" && !inAuth) {
      router.replace("/(auth)/login")
    } else if (state === "authenticated" && inAuth) {
      router.replace("/(app)/")
    }
  }, [router, state, segments])

  return <Slot />
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    Roboto_900Black,
  })
  // Root layout mounts once per cold launch, so warm resumes do not replay it.
  const [bootDone, setBootDone] = useState(false)

  // Set the notification foreground handler / Android channel once at startup.
  useEffect(() => { configureForeground() }, [])

  if (!fontsLoaded) return null

  applyDefaultFont()

  // Mount no application screens behind the boot animation. Native alerts
  // render above React views, so delaying the app is the only reliable way
  // to guarantee errors and session messages appear after startup.
  if (!bootDone) {
    return <BootAnimation onComplete={() => setBootDone(true)} />
  }

  return (
    <AuthProvider>
      <PreferencesProvider>
        <Guard />
        <ActionSheetHost />
      </PreferencesProvider>
    </AuthProvider>
  )
}
