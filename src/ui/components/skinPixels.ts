/**
 * Minecraft only draws an overlay region (hat, jacket…) of a legacy 64×32 skin when it has some
 * transparent pixel; a fully opaque region is treated as unused. Old skins often fill it with black.
 */
export function overlayIsUsed(image: HTMLImageElement, x: number, y: number, w: number, h: number): boolean {
  if (image.naturalHeight !== 32) return true
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h)
  try {
    const data = ctx.getImageData(0, 0, w, h).data
    for (let i = 3; i < data.length; i += 4) if (data[i] < 128) return true
    return false
  } catch {
    // A texture without CORS cannot be inspected: keep the overlay, as before
    return true
  }
}
