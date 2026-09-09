import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const animationFiles = [
  "app/(app)/index.tsx",
  "app/(app)/cases/new.tsx",
  "src/components/BootAnimation.tsx",
  "src/components/intraop/FeedbackPressable.tsx",
]

describe("React Native animation driver boundary", () => {
  it("uses the native driver on devices but never asks React Native Web for it", () => {
    for (const relative of animationFiles) {
      const source = readFileSync(join(process.cwd(), relative), "utf8")
      expect(source, relative).toContain('USE_NATIVE_DRIVER = Platform.OS !== "web"')
      expect(source, relative).not.toContain("useNativeDriver: true")
    }
  })
})
