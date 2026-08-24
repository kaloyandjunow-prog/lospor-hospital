import { describe, expect, it } from "vitest"
import { authorityNavigationForRole } from "./authority-navigation"

describe("authority navigation", () => {
  it("exposes the full administration surface only to administrators", () => {
    expect(authorityNavigationForRole("ADMIN")).toBe("ADMINISTRATION")
  })

  it("makes the institution-request queue discoverable by a head of department", () => {
    expect(authorityNavigationForRole("HEAD_OF_DEPT")).toBe("INSTITUTION_REQUESTS")
  })

  it.each(["MEMBER", "RESEARCHER", "CLINICIAN", "", null, undefined])(
    "does not advertise an authority surface to %s",
    (role) => {
      expect(authorityNavigationForRole(role)).toBeNull()
    },
  )
})
