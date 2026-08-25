import { afterEach, describe, expect, it } from "vitest"
import { hospitalSupportConfiguration } from "./support-config"

const original = process.env.LOSPOR_SUPPORT_URL

afterEach(() => {
  if (original === undefined) delete process.env.LOSPOR_SUPPORT_URL
  else process.env.LOSPOR_SUPPORT_URL = original
})

describe("Hospital support configuration", () => {
  it.each([
    ["https://help.hospital.example/tickets", "https://help.hospital.example/tickets"],
    ["mailto:support@hospital.example?subject=ignored", "mailto:support@hospital.example"],
  ])("publishes a safe clinician support destination", (configured, expected) => {
    process.env.LOSPOR_SUPPORT_URL = configured
    expect(hospitalSupportConfiguration()).toEqual({ configured: true, contactUrl: expected })
  })

  it.each([
    "http://help.hospital.example",
    "https://user:password@help.hospital.example",
    "javascript:alert(1)",
    "mailto:not-an-address",
    "mailto:support@hospital.example#hidden",
    "mailto:support@hospital.example%23hidden",
    "mailto:.support@hospital.example",
    "mailto:support@-hospital.example",
  ])("fails closed for unsafe configuration %s", configured => {
    process.env.LOSPOR_SUPPORT_URL = configured
    expect(hospitalSupportConfiguration()).toEqual({ configured: false, contactUrl: null })
  })
})
