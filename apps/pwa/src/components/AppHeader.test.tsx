import React from "react"
import { describe, expect, it, vi } from "vitest"
import { Text } from "react-native"
import { render } from "@/test/render"

vi.mock("expo-router", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }))
vi.mock("@/components/OfflineLibraryBanner", () => ({ OfflineLibraryBanner: () => null }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ t: (key: string) => key }) }))
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: ({ name }: { name: string }) => <Text>{name}</Text> }))

import { AppHeader } from "./AppHeader"

describe("the intraoperative app header actions", () => {
  it.each([false, true])("keeps home and settings visible in %s compact mode", compact => {
    const tree = render(<AppHeader title="Intraoperative" showNewCase={false} compact={compact} />)

    expect(tree.root.findByProps({ testID: "app-header-home" })).toBeTruthy()
    expect(tree.root.findByProps({ testID: "app-header-settings" })).toBeTruthy()
  })
})
