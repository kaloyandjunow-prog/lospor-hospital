import { expect, type Locator, type Page } from "@playwright/test"

// HTML5 drag of a bar's grip, as a hand does it (shared by the intraop specs).
export async function dragGrip(page: Page, chart: Locator, gripSel: string, toIndex: number, cellSel = "[data-agent-cell]") {
  // Playwright occasionally presses a pixel the browser does not treat as the
  // start of an HTML5 drag; confirm it started and grab again if it did not.
  await page.evaluate(() => {
    const w = window as unknown as { __dragStarted?: boolean; __dragListener?: boolean }
    w.__dragStarted = false
    if (!w.__dragListener) { w.__dragListener = true; document.addEventListener("dragstart", () => { w.__dragStarted = true }, true) }
  })
  const started = () => page.evaluate(() => (window as unknown as { __dragStarted?: boolean }).__dragStarted === true)
  let g!: { x: number; y: number; width: number; height: number }
  for (let attempt = 0; attempt < 4; attempt++) {
    g = (await chart.locator(gripSel).first().boundingBox())!
    const target = (await chart.locator(cellSel).nth(toIndex).boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2 + (target.x < g.x ? -8 : 8), g.y + g.height / 2, { steps: 4 })
    await page.waitForTimeout(150)
    if (await started()) break
    await page.mouse.up()
    await page.waitForTimeout(400)
  }
  expect(await started(), "the grip never started a drag").toBe(true)
  const target = (await chart.locator(cellSel).nth(toIndex).boundingBox())!
  for (let i = 1; i <= 6; i++) {
    const x = g.x + g.width / 2 + ((target.x + target.width / 2) - (g.x + g.width / 2)) * i / 6
    await page.mouse.move(x, g.y + g.height / 2, { steps: 4 })
    await page.waitForTimeout(120)
  }
  // A hand keeps moving a little before it lets go; releasing in the same
  // instant as the last hover can land on an element React has just replaced.
  await page.mouse.move(target.x + target.width / 2 + 2, g.y + g.height / 2, { steps: 2 })
  await page.waitForTimeout(600)
  await page.mouse.up()
}

