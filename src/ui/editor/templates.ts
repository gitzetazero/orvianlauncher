import { box, faces, PARTS, SIZE, type FaceId, type PartId } from './layout'
import { normalizeSkin } from './doc'

/** Minecraft's own default skins, served by Mojang's texture host (which allows CORS). */
export const DEFAULT_SKINS = {
  steve: { url: 'https://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb', slim: false },
  alex: { url: 'https://textures.minecraft.net/texture/46acd06e8483b176e8ea39fc12fe105eb3a2a4970f5100057e9d84d4b60bdfa7', slim: true }
} as const

/** Loads a skin image (any origin that allows CORS, or a data URL) into 64×64 RGBA pixels. */
export function loadSkinPixels(src: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (image.naturalWidth !== SIZE || (image.naturalHeight !== SIZE && image.naturalHeight !== 32)) {
        reject(new Error('La skin debe medir 64×64 o 64×32 píxeles.'))
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return reject(new Error('No se pudo leer la imagen.'))
      ctx.drawImage(image, 0, 0)
      resolve(normalizeSkin(ctx.getImageData(0, 0, canvas.width, canvas.height)))
    }
    image.onerror = () => reject(new Error('No se pudo cargar la imagen.'))
    image.src = src
  })
}

const PART_COLOURS: Record<PartId, [number, number, number]> = {
  head: [226, 87, 76],
  body: [70, 152, 222],
  rightArm: [99, 190, 108],
  leftArm: [233, 178, 64],
  rightLeg: [160, 105, 214],
  leftLeg: [56, 196, 186]
}

const FACE_SHADE: Record<FaceId, number> = { front: 1, top: 1.25, bottom: 0.6, right: 0.82, left: 0.82, back: 0.68 }

/**
 * Reference textures. "uv": every face of every part filled with its own colour, so the map of the
 * texture is readable at a glance. "guide": the same, plus a marked front and a darker overlay layer.
 */
export function referenceTexture(kind: 'uv' | 'guide', slim: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4)
  const layers = kind === 'uv' ? (['base', 'overlay'] as const) : (['base'] as const)
  for (const layer of layers) {
    for (const part of PARTS) {
      const all = faces(box(part, layer, slim))
      for (const face of Object.keys(all) as FaceId[]) {
        const rect = all[face]
        const [r, g, b] = PART_COLOURS[part].map((n) => Math.min(255, n * FACE_SHADE[face] * (layer === 'overlay' ? 0.7 : 1)))
        for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
          const i = (y * SIZE + x) * 4
          // The guide checkers each face so single pixels are easy to count
          const checker = kind === 'guide' && (x + y) % 2 === 0 ? 0.9 : 1
          // and marks the front with a light border
          const edge = kind === 'guide' && face === 'front' && (x === rect.x || y === rect.y || x === rect.x + rect.w - 1 || y === rect.y + rect.h - 1)
          out[i] = edge ? 245 : r * checker
          out[i + 1] = edge ? 245 : g * checker
          out[i + 2] = edge ? 245 : b * checker
          out[i + 3] = layer === 'overlay' ? 150 : 255
        }
      }
    }
  }
  return out
}

/** The skin as a PNG data URL (for download, the Locker and the account). */
export function toPngDataUrl(pixels: Uint8ClampedArray): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), SIZE, SIZE), 0, 0)
  return canvas.toDataURL('image/png')
}
