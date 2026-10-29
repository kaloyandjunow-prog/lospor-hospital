// @vitest-environment jsdom

import { render } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import enMessages from "../../messages/en.json"
import { HandoverButton } from "./HandoverButton"

function renderButton(caseStatus: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <HandoverButton caseId="case-1" caseOwnerId="owner-1" sessionUserId="owner-1" sessionRole="MEMBER" caseStatus={caseStatus} hasPendingTransfer={false} />
    </NextIntlClientProvider>,
  )
}

describe("handing a case over", () => {
  it("is offered on an open case", () => {
    expect(renderButton("IN_PROGRESS").container.textContent).toContain("Hand over")
  })

  it("is not offered where the server would refuse it: a finished case or a cancelled procedure (10.0.0)", () => {
    expect(renderButton("COMPLETE").container.textContent).toBe("")
    expect(renderButton("CANCELLED").container.textContent).toBe("")
  })
})
