// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { uprightImageBase64 } from "./upright-image"

afterEach(() => vi.unstubAllGlobals())

describe("uprightImageBase64 (10.4.1)", () => {
  it("decodes with the photo's own orientation, scales to 3000 px and sends JPEG", async () => {
    const createImageBitmap = vi.fn(async () => ({ width: 3000, height: 4000, close: vi.fn() }))
    vi.stubGlobal("createImageBitmap", createImageBitmap)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never)
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback) {
      done(new Blob(["upright"], { type: "image/jpeg" }))
    })
    const photo = new File(["sideways"], "photo.jpg", { type: "image/jpeg" })

    const sent = await uprightImageBase64(photo)

    expect(createImageBitmap).toHaveBeenCalledWith(photo, { imageOrientation: "from-image" })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2250, 3000)
    expect(sent).toEqual({ imageBase64: btoa("upright"), mimeType: "image/jpeg" })
  })

  it("sends the file as it is when the browser cannot decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("unsupported") }))
    const photo = new File(["png bytes"], "scan.png", { type: "image/png" })
    expect(await uprightImageBase64(photo)).toEqual({ imageBase64: btoa("png bytes"), mimeType: "image/png" })
  })
})
