import React from "react"
import { describe, expect, it } from "vitest"
import { AuthProvider } from "@/lib/auth-context"
import { PreferencesProvider } from "@/lib/preferences-context"
import { render } from "@/test/render"
import { broselowZone } from "@lospor/core/broselow"
import { BroselowChip } from "./BroselowChip"

function chip(language: "en" | "bg", heightCm: number | null, weightKg: number | null) {
  const result = broselowZone({ clinicalMode: "PEDIATRIC", heightCm, weightKg })!
  return render(
    <AuthProvider>
      <PreferencesProvider initialLanguage={language}><BroselowChip result={result} /></PreferencesProvider>
    </AuthProvider>,
  )
}

describe("the Broselow chip", () => {
  it("names the zone and says it came from the height", () => {
    const view = chip("en", 100, 16)
    const text = JSON.stringify(view.toJSON())
    expect(text).toContain("Broselow")
    expect(text).toContain("White")
    expect(text).toContain("by height")
  })

  it("names it in Bulgarian, from the weight when there is no height", () => {
    const view = chip("bg", null, 13)
    const text = JSON.stringify(view.toJSON())
    expect(text).toContain("Жълт")
    expect(text).toContain("по тегло")
  })

  it("is drawn in the tape's own colour", () => {
    const view = chip("en", 70, 9)
    expect(JSON.stringify(view.toJSON())).toContain("#ef4444")
  })
})
