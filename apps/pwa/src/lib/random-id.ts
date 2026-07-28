export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  const webCrypto = globalThis.crypto

  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes)
  } else {
    // React Native does not always expose Web Crypto. These IDs identify local
    // drafts/devices rather than secrets, so a timestamp-seeded fallback is fine.
    let seed = Date.now() ^ Math.floor(Math.random() * 0x7fffffff)
    for (let index = 0; index < bytes.length; index += 1) {
      seed = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed)
      bytes[index] = (seed ^ (seed >>> 14) ^ Math.floor(Math.random() * 256)) & 0xff
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
