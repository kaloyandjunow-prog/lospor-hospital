import { expect, test, type CDPSession, type Page } from "@playwright/test"
import { newStartedCase, openStartRow } from "./intraop-helpers"

// Sliders and press-and-hold buttons take the finger for as long as it is down.
//
// The intraop screen changes tab on a sideways swipe, and a thumb that drifts while it holds "+" or drags a
// slider is exactly a sideways swipe. The tab must not change under it, and the browser must not start
// selecting text either. These tests drive real touch events (Chrome DevTools protocol), not clicks, because
// a click never moves.

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", x?: number, y?: number) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x: x ?? 0, y: y ?? 0, id: 1 }],
  })
}

/** Puts a finger down at `from`, holds it, and drags it to `to` in small steps, without lifting. */
async function dragTo(page: Page, cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }, holdMs = 0) {
  await touch(cdp, "touchStart", from.x, from.y)
  if (holdMs) await page.waitForTimeout(holdMs)
  const steps = 14
  for (let step = 1; step <= steps; step += 1) {
    await touch(cdp, "touchMove", from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps)
    await page.waitForTimeout(16)
  }
}

async function centre(page: Page, testId: string) {
  // The sheet slides up from the bottom; a finger put down while it is still moving lands on the page behind.
  const viewport = page.viewportSize()!
  await expect.poll(async () => (await page.getByTestId(testId).first().boundingBox())?.y ?? Infinity, { timeout: 10_000 })
    .toBeLessThan(viewport.height - 40)
  await page.waitForTimeout(500)
  const box = await page.getByTestId(testId).first().boundingBox()
  expect(box, `${testId} is not on screen`).not.toBeNull()
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, box: box! }
}

async function openGasSheet(page: Page, request: import("@playwright/test").APIRequestContext) {
  const session = await newStartedCase(page, request)
  await openStartRow(page, session.rowTime)
  await page.getByText("FGF", { exact: true }).first().click()
  await expect(page.getByTestId("stepper-track").first()).toBeVisible()
  return session
}

/** The Timetable tab is the only one with the End case footer. */
async function stillOnTimetable(page: Page) {
  await page.getByText("✕", { exact: true }).first().click()
  await expect(page.getByText("End case", { exact: true })).toBeVisible()
}

const selected = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "")
const heldMark = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-gesture"))

test.describe("holding and dragging controls", () => {
  test("dragging a slider far to the side sets its value and never changes the tab", async ({ page, request }) => {
    await openGasSheet(page, request)
    const cdp = await page.context().newCDPSession(page)
    const track = await centre(page, "stepper-track")

    // From the middle of the slider to well past its left edge: further than any tab swipe needs.
    await dragTo(page, cdp, { x: track.x, y: track.y }, { x: 4, y: track.y })
    expect(await heldMark(page), "the page is not marked as held while the slider has the finger").toBe("held")
    await touch(cdp, "touchEnd")

    await expect(page.getByTestId("stepper-value").first()).not.toHaveText("-")
    expect(await heldMark(page), "the hold was never released").toBeNull()
    expect(await selected(page)).toBe("")
    await stillOnTimetable(page)
  })

  test("holding + and drifting sideways keeps stepping and never changes the tab", async ({ page, request }) => {
    await openGasSheet(page, request)
    const cdp = await page.context().newCDPSession(page)
    const plus = await centre(page, "stepper-plus")
    const value = page.getByTestId("stepper-value").first()

    await dragTo(page, cdp, { x: plus.x, y: plus.y }, { x: 6, y: plus.y + 6 }, 900)
    expect(await heldMark(page), "the page is not marked as held while + has the finger").toBe("held")
    expect(await selected(page)).toBe("")
    await touch(cdp, "touchEnd")

    // Held long enough to repeat, so it stepped more than the single tap's one step.
    const stepped = Number((await value.innerText()).replace(/[^\d.]/g, ""))
    expect(stepped, "the held button did not keep stepping").toBeGreaterThan(0.2)
    expect(await heldMark(page)).toBeNull()
    await stillOnTimetable(page)
  })

  test("pressing and holding buttons with a mouse never selects text", async ({ page, request }) => {
    await openGasSheet(page, request)
    const plus = await centre(page, "stepper-plus")
    const value = await centre(page, "stepper-value")

    await page.mouse.move(plus.x, plus.y)
    await page.mouse.down()
    await page.waitForTimeout(700)
    // Sweep across the labels and numbers on the way out, as a drag that selects text would.
    await page.mouse.move(value.x, value.y, { steps: 8 })
    await page.mouse.move(4, plus.y - 160, { steps: 14 })
    expect(await selected(page), "text was selected under a held button").toBe("")
    await page.mouse.up()
    expect(await selected(page)).toBe("")
  })
})
