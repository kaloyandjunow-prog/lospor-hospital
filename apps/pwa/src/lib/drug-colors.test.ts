import { describe, expect, it, vi } from "vitest"

vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

import { drugGroupColorHex } from "@lospor/core/catalog"
import type { LibraryOption } from "@lospor/core/option-library"
import { currentDrugColors, customDrugTone } from "./drug-colors"

const OPIOIDS = "Opioid analgesics"
function option(label: string, extra: Partial<LibraryOption> = {}): LibraryOption {
  return {
    id: label, value: label.toUpperCase(), label, labelBg: null, group: OPIOIDS, parentId: null, color: null,
    description: null, drugId: null, atcCode: null, inn: null, metadata: null, ...extra,
  }
}

describe("each drug's colour now, on the phone (10.0.0)", () => {
  it("is the bundled colour when the hospital chose none", () => {
    const colors = currentDrugColors([option("Fentanyl")], [option("Remifentanil", { color: "#ec4899" })], "dark")
    expect(colors.drug("Fentanyl")).toBe(drugGroupColorHex(OPIOIDS))
    expect(colors.infusion("Remifentanil")).toBe("#ec4899")
    expect(colors.drug("Unknown")).toBeUndefined()
  })

  it("takes the drug's own colour over its group's, for its bolus and its infusion alike", () => {
    const remi = { customColor: "#22c55e", customGroupColor: "#3b82f6" }
    const colors = currentDrugColors(
      [option("Fentanyl", { customColor: "#3b82f6", customGroupColor: "#3b82f6" }), option("Remifentanil", remi)],
      [option("Remifentanil", { color: "#ec4899", ...remi })],
      "dark",
    )
    expect(colors.group(OPIOIDS)).toBe(customDrugTone("#3b82f6", "dark"))
    expect(colors.drug("Fentanyl")).toBe(customDrugTone("#3b82f6", "dark"))
    expect(colors.drug("Remifentanil")).toBe(customDrugTone("#22c55e", "dark"))
    expect(colors.infusion("Remifentanil")).toBe(colors.drug("Remifentanil"))
  })

  it("darkens a pale hospital colour for the light theme", () => {
    expect(customDrugTone("#ffff99", "light")).not.toBe("#ffff99")
    expect(customDrugTone("#ffff99", "dark")).toBe("#ffff99")
  })
})
