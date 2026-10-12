/**
 * Where every face of a Minecraft skin lives on the 64×64 texture. Mirrors skinview3d's UV layout,
 * so a pixel picked on the 3D model, the flat figure or the texture all mean the same thing.
 */

export const SIZE = 64

export type PartId = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
export type LayerKind = 'base' | 'overlay'
export type FaceId = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'

export const PARTS: readonly PartId[] = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']

export const PART_LABEL: Record<PartId, string> = {
  head: 'Cabeza',
  body: 'Torso',
  rightArm: 'Brazo derecho',
  leftArm: 'Brazo izquierdo',
  rightLeg: 'Pierna derecha',
  leftLeg: 'Pierna izquierda'
}

export interface Box {
  u: number
  v: number
  w: number
  h: number
  d: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const ORIGIN: Record<LayerKind, Record<PartId, [number, number]>> = {
  base: { head: [0, 0], body: [16, 16], rightArm: [40, 16], leftArm: [32, 48], rightLeg: [0, 16], leftLeg: [16, 48] },
  overlay: { head: [32, 0], body: [16, 32], rightArm: [40, 32], leftArm: [48, 48], rightLeg: [0, 32], leftLeg: [0, 48] }
}

export function box(part: PartId, layer: LayerKind, slim: boolean): Box {
  const [u, v] = ORIGIN[layer][part]
  if (part === 'head') return { u, v, w: 8, h: 8, d: 8 }
  if (part === 'body') return { u, v, w: 8, h: 12, d: 4 }
  const arm = part === 'rightArm' || part === 'leftArm'
  return { u, v, w: arm && slim ? 3 : 4, h: 12, d: 4 }
}

/** The six faces of a box, as skinview3d maps them. */
export function faces(b: Box): Record<FaceId, Rect> {
  const { u, v, w, h, d } = b
  return {
    top: { x: u + d, y: v, w, h: d },
    bottom: { x: u + d + w, y: v, w, h: d },
    right: { x: u, y: v + d, w: d, h },
    front: { x: u + d, y: v + d, w, h },
    left: { x: u + d + w, y: v + d, w: d, h },
    back: { x: u + 2 * d + w, y: v + d, w, h }
  }
}

export interface PixelPlace {
  part: PartId
  layer: LayerKind
  face: FaceId
  rect: Rect
  /** Position inside the face. */
  lx: number
  ly: number
}

const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

/** Which face of which part a texture pixel belongs to, or null for unused texture space. */
export function locate(x: number, y: number, slim: boolean): PixelPlace | null {
  for (const layer of ['base', 'overlay'] as const) {
    for (const part of PARTS) {
      const all = faces(box(part, layer, slim))
      for (const face of Object.keys(all) as FaceId[]) {
        const rect = all[face]
        if (inside(rect, x, y)) return { part, layer, face, rect, lx: x - rect.x, ly: y - rect.y }
      }
    }
  }
  return null
}

const MIRROR_PART: Record<PartId, PartId> = { head: 'head', body: 'body', rightArm: 'leftArm', leftArm: 'rightArm', rightLeg: 'leftLeg', leftLeg: 'rightLeg' }
const MIRROR_FACE: Record<FaceId, FaceId> = { top: 'top', bottom: 'bottom', front: 'front', back: 'back', right: 'left', left: 'right' }

/** The pixel on the other side of the body, as if the character were reflected left to right. */
export function mirror(x: number, y: number, slim: boolean): [number, number] | null {
  const place = locate(x, y, slim)
  if (!place) return null
  const target = faces(box(MIRROR_PART[place.part], place.layer, slim))[MIRROR_FACE[place.face]]
  if (target.w !== place.rect.w || target.h !== place.rect.h) return null
  return [target.x + (target.w - 1 - place.lx), target.y + place.ly]
}

/** Every texture pixel that belongs to a face of `layer` (used to mask painting to one layer). */
export function layerMask(layer: LayerKind, slim: boolean): Uint8Array {
  const mask = new Uint8Array(SIZE * SIZE)
  for (const part of PARTS) {
    for (const rect of Object.values(faces(box(part, layer, slim)))) {
      for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) mask[y * SIZE + x] = 1
    }
  }
  return mask
}

/**
 * The flat view: the character seen from the front, 16×32 skin pixels. Each entry places a part's
 * front face; arms keep their real width (3 px when slim) against the torso.
 */
export function flatLayout(slim: boolean): Array<{ part: PartId; at: [number, number] }> {
  const arm = slim ? 3 : 4
  return [
    { part: 'head', at: [4, 0] },
    { part: 'body', at: [4, 8] },
    { part: 'rightArm', at: [4 - arm, 8] },
    { part: 'leftArm', at: [12, 8] },
    { part: 'rightLeg', at: [4, 20] },
    { part: 'leftLeg', at: [8, 20] }
  ]
}

/** Texture pixel under a point of the flat figure, for the given layer. */
export function flatToTexture(fx: number, fy: number, layer: LayerKind, slim: boolean): [number, number] | null {
  for (const { part, at } of flatLayout(slim)) {
    const front = faces(box(part, layer, slim)).front
    const lx = fx - at[0]
    const ly = fy - at[1]
    if (lx >= 0 && ly >= 0 && lx < front.w && ly < front.h) return [front.x + lx, front.y + ly]
  }
  return null
}
