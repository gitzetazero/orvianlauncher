import { clamp, fromHsv, shade, toHsv, type RGBA } from './color'
import { layerMask, locate, mirror, SIZE, type LayerKind } from './layout'

/** Adjustments kept per layer and applied when the stack is composited: nothing is lost by moving a slider. */
export interface Filters {
  tint: string | null
  tintAmount: number
  brightness: number
  contrast: number
  saturation: number
  hue: number
  greyscale: boolean
  invert: boolean
}

export const NO_FILTERS: Filters = { tint: null, tintAmount: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, greyscale: false, invert: false }

export interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number
  pixels: Uint8ClampedArray
  filters: Filters
}

export type Tool = 'brush' | 'eraser' | 'fill' | 'shade' | 'pick'

export interface Snapshot {
  layers: Layer[]
  active: string
}

let nextId = 1
const newId = (): string => `capa-${Date.now().toString(36)}-${nextId++}`

export function blankLayer(name = 'Capa nueva'): Layer {
  return { id: newId(), name, visible: true, opacity: 100, pixels: new Uint8ClampedArray(SIZE * SIZE * 4), filters: { ...NO_FILTERS } }
}

const cloneLayer = (layer: Layer): Layer => ({ ...layer, pixels: new Uint8ClampedArray(layer.pixels), filters: { ...layer.filters } })

function applyFilters(r: number, g: number, b: number, f: Filters): [number, number, number] {
  if (f.invert) [r, g, b] = [255 - r, 255 - g, 255 - b]
  if (f.greyscale) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    r = g = b = y
  }
  if (f.hue !== 0 || f.saturation !== 100) {
    const hsv = toHsv({ r, g, b, a: 255 })
    const c = fromHsv((hsv.h + f.hue + 360) % 360, clamp(hsv.s * (f.saturation / 100), 0, 1), hsv.v)
    ;[r, g, b] = [c.r, c.g, c.b]
  }
  if (f.brightness !== 100) [r, g, b] = [r, g, b].map((n) => n * (f.brightness / 100)) as [number, number, number]
  if (f.contrast !== 100) [r, g, b] = [r, g, b].map((n) => (n - 128) * (f.contrast / 100) + 128) as [number, number, number]
  if (f.tint && f.tintAmount > 0) {
    const t = parseInt(f.tint.slice(1), 16)
    const k = f.tintAmount / 100
    r = r * (1 - k) + ((t >> 16) & 255) * k
    g = g * (1 - k) + ((t >> 8) & 255) * k
    b = b * (1 - k) + (t & 255) * k
  }
  return [clamp(r), clamp(g), clamp(b)]
}

const hasFilters = (f: Filters): boolean => f.invert || f.greyscale || f.hue !== 0 || f.saturation !== 100 || f.brightness !== 100 || f.contrast !== 100 || (f.tint !== null && f.tintAmount > 0)

/** The layers stacked bottom to top with their opacity and filters: what the PNG will contain. */
export function composite(layers: Layer[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (const layer of layers) {
    if (!layer.visible || layer.opacity === 0) continue
    const filtered = hasFilters(layer.filters)
    const opacity = layer.opacity / 100
    const src = layer.pixels
    for (let i = 0; i < src.length; i += 4) {
      const a = (src[i + 3] / 255) * opacity
      if (a === 0) continue
      let [r, g, b] = [src[i], src[i + 1], src[i + 2]]
      if (filtered) [r, g, b] = applyFilters(r, g, b, layer.filters)
      const da = out[i + 3] / 255
      const oa = a + da * (1 - a)
      out[i] = (r * a + out[i] * da * (1 - a)) / oa
      out[i + 1] = (g * a + out[i + 1] * da * (1 - a)) / oa
      out[i + 2] = (b * a + out[i + 2] * da * (1 - a)) / oa
      out[i + 3] = oa * 255
    }
  }
  return out
}

/** Minecraft skins must be 64×64; an old 64×32 skin gets its left limbs from the right ones, as the game does. */
export function normalizeSkin(source: ImageData): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4)
  const rows = Math.min(source.height, SIZE)
  for (let y = 0; y < rows; y++) for (let x = 0; x < SIZE; x++) {
    const s = (y * source.width + x) * 4
    const d = (y * SIZE + x) * 4
    out[d] = source.data[s]
    out[d + 1] = source.data[s + 1]
    out[d + 2] = source.data[s + 2]
    out[d + 3] = source.data[s + 3]
  }
  if (source.height === 32) {
    // Right leg (0,16) → left leg (16,48); right arm (40,16) → left arm (32,48), each face mirrored
    const copyMirrored = (sx: number, sy: number, dx: number, dy: number): void => {
      const fw = [4, 4, 4, 4]
      const fx = [0, 4, 8, 12]
      for (let row = 0; row < 16; row++) {
        for (let f = 0; f < 4; f++) {
          for (let col = 0; col < fw[f]; col++) {
            // The side faces swap places when a limb is mirrored
            const srcFace = row < 4 ? f : f === 0 ? 2 : f === 2 ? 0 : f
            const s = ((sy + row) * SIZE + sx + fx[srcFace] + (fw[f] - 1 - col)) * 4
            const d = ((dy + row) * SIZE + dx + fx[f] + col) * 4
            out.set(out.subarray(s, s + 4), d)
          }
        }
      }
    }
    copyMirrored(0, 16, 16, 48)
    copyMirrored(40, 16, 32, 48)
  }
  return out
}

/** The working document: the layer stack, the active layer and the undo history. */
export class SkinDocument {
  layers: Layer[]
  active: string
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private listeners = new Set<() => void>()
  version = 0

  constructor(base?: Uint8ClampedArray, name = 'Skin en blanco') {
    const first = blankLayer(name)
    if (base) first.pixels.set(base)
    this.layers = [first]
    this.active = first.id
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed(): void {
    this.version++
    this.listeners.forEach((listener) => listener())
  }

  get activeLayer(): Layer {
    return this.layers.find((layer) => layer.id === this.active) ?? this.layers[this.layers.length - 1]
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Saves the current state so the next change can be undone. Call once per stroke or action. */
  checkpoint(): void {
    this.undoStack.push({ layers: this.layers.map(cloneLayer), active: this.active })
    if (this.undoStack.length > 80) this.undoStack.shift()
    this.redoStack = []
  }

  undo(): void {
    const previous = this.undoStack.pop()
    if (!previous) return
    this.redoStack.push({ layers: this.layers.map(cloneLayer), active: this.active })
    this.layers = previous.layers
    this.active = previous.active
    this.changed()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push({ layers: this.layers.map(cloneLayer), active: this.active })
    this.layers = next.layers
    this.active = next.active
    this.changed()
  }

  /** Replaces everything with one layer holding `pixels`. */
  reset(pixels: Uint8ClampedArray | null, name: string): void {
    this.checkpoint()
    const layer = blankLayer(name)
    if (pixels) layer.pixels.set(pixels)
    this.layers = [layer]
    this.active = layer.id
    this.changed()
  }

  private cached: { version: number; pixels: Uint8ClampedArray; colors?: string[] } | null = null

  /** The flattened skin for the current version; recomputed only after a change. */
  composite(): Uint8ClampedArray {
    if (this.cached?.version !== this.version) this.cached = { version: this.version, pixels: composite(this.layers) }
    return this.cached.pixels
  }

  // ─── Painting ─────────────────────────────────────────────────────────────

  /**
   * Applies `tool` at texture pixel (x, y) on the active layer, honouring brush size, the target skin
   * layer (base or overlay) and mirror. Returns the colour picked, for the eyedropper.
   */
  paint(x: number, y: number, opts: { tool: Tool; color: RGBA; size: number; round: boolean; mirror: boolean; target: LayerKind; slim: boolean; inverse: boolean }): RGBA | null {
    const layer = this.activeLayer
    if (opts.tool === 'pick') {
      const flat = this.composite()
      const i = (y * SIZE + x) * 4
      return flat[i + 3] === 0 ? null : { r: flat[i], g: flat[i + 1], b: flat[i + 2], a: 255 }
    }
    const mask = layerMask(opts.target, opts.slim)
    const points: Array<[number, number]> = [[x, y]]
    if (opts.mirror) {
      const m = mirror(x, y, opts.slim)
      if (m) points.push(m)
    }
    for (const [px, py] of points) {
      if (opts.tool === 'fill') this.fill(layer, px, py, opts.inverse ? null : opts.color, mask, opts.slim)
      else this.stamp(layer, px, py, opts, mask)
    }
    this.changed()
    return null
  }

  private stamp(layer: Layer, x: number, y: number, opts: { tool: Tool; color: RGBA; size: number; round: boolean; inverse: boolean; slim: boolean }, mask: Uint8Array): void {
    const r = opts.size - 1
    const place = locate(x, y, opts.slim)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (opts.round && dx * dx + dy * dy > r * r + 0.5) continue
      const px = x + dx
      const py = y + dy
      if (px < 0 || py < 0 || px >= SIZE || py >= SIZE || !mask[py * SIZE + px]) continue
      // A bigger brush stays on the face it started on, so it never bleeds into a neighbour on the texture
      if (place && (px < place.rect.x || py < place.rect.y || px >= place.rect.x + place.rect.w || py >= place.rect.y + place.rect.h)) continue
      const i = (py * SIZE + px) * 4
      const p = layer.pixels
      if (opts.tool === 'eraser' || (opts.tool === 'brush' && opts.inverse)) {
        p[i + 3] = 0
      } else if (opts.tool === 'shade') {
        if (p[i + 3] === 0) continue
        const c = shade({ r: p[i], g: p[i + 1], b: p[i + 2], a: p[i + 3] }, opts.inverse ? -0.07 : 0.07)
        p[i] = c.r
        p[i + 1] = c.g
        p[i + 2] = c.b
      } else {
        p[i] = opts.color.r
        p[i + 1] = opts.color.g
        p[i + 2] = opts.color.b
        p[i + 3] = 255
      }
    }
  }

  /** Flood fill of same-coloured pixels, kept inside the face that was clicked. */
  private fill(layer: Layer, x: number, y: number, color: RGBA | null, mask: Uint8Array, slim: boolean): void {
    const place = locate(x, y, slim)
    if (!place || !mask[y * SIZE + x]) return
    const p = layer.pixels
    const start = (y * SIZE + x) * 4
    const target = [p[start], p[start + 1], p[start + 2], p[start + 3]]
    const same = (i: number): boolean => (target[3] === 0 ? p[i + 3] === 0 : p[i] === target[0] && p[i + 1] === target[1] && p[i + 2] === target[2] && p[i + 3] === target[3])
    const seen = new Uint8Array(SIZE * SIZE)
    const stack: Array<[number, number]> = [[x, y]]
    const { rect } = place
    while (stack.length > 0) {
      const [cx, cy] = stack.pop() as [number, number]
      if (cx < rect.x || cy < rect.y || cx >= rect.x + rect.w || cy >= rect.y + rect.h) continue
      const k = cy * SIZE + cx
      if (seen[k]) continue
      seen[k] = 1
      const i = k * 4
      if (!same(i)) continue
      if (color) {
        p[i] = color.r
        p[i + 1] = color.g
        p[i + 2] = color.b
        p[i + 3] = 255
      } else p[i + 3] = 0
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
    }
  }

  // ─── Layers ───────────────────────────────────────────────────────────────

  addLayer(): void {
    this.checkpoint()
    const layer = blankLayer(`Capa ${this.layers.length + 1}`)
    const index = this.layers.findIndex((item) => item.id === this.active)
    this.layers.splice(index + 1, 0, layer)
    this.active = layer.id
    this.changed()
  }

  updateLayer(id: string, patch: Partial<Pick<Layer, 'name' | 'visible' | 'opacity'>> & { filters?: Partial<Filters> }, record = true): void {
    if (record) this.checkpoint()
    this.layers = this.layers.map((layer) => (layer.id === id ? { ...layer, ...patch, filters: { ...layer.filters, ...patch.filters } } : layer))
    this.changed()
  }

  select(id: string): void {
    this.active = id
    this.changed()
  }

  move(id: string, delta: -1 | 1): void {
    const index = this.layers.findIndex((layer) => layer.id === id)
    const to = index + delta
    if (index < 0 || to < 0 || to >= this.layers.length) return
    this.checkpoint()
    const next = [...this.layers]
    ;[next[index], next[to]] = [next[to], next[index]]
    this.layers = next
    this.changed()
  }

  duplicate(id: string): void {
    const index = this.layers.findIndex((layer) => layer.id === id)
    if (index < 0) return
    this.checkpoint()
    const copy = { ...cloneLayer(this.layers[index]), id: newId(), name: `${this.layers[index].name} (copia)` }
    this.layers.splice(index + 1, 0, copy)
    this.active = copy.id
    this.changed()
  }

  /** Bakes a layer (with its opacity and filters) into the one below it. */
  mergeDown(id: string): void {
    const index = this.layers.findIndex((layer) => layer.id === id)
    if (index <= 0) return
    this.checkpoint()
    const below = this.layers[index - 1]
    const merged = { ...below, pixels: composite([{ ...below, visible: true }, { ...this.layers[index], visible: true }]), opacity: 100, filters: { ...NO_FILTERS } }
    this.layers = [...this.layers.slice(0, index - 1), merged, ...this.layers.slice(index + 1)]
    this.active = merged.id
    this.changed()
  }

  remove(id: string): void {
    if (this.layers.length <= 1) return
    this.checkpoint()
    this.layers = this.layers.filter((layer) => layer.id !== id)
    if (this.active === id) this.active = this.layers[this.layers.length - 1].id
    this.changed()
  }

  /** Distinct visible colours in the skin, most used first. */
  colorsInSkin(limit = 40): string[] {
    const flatNow = this.composite()
    if (this.cached?.colors) return this.cached.colors
    const counts = new Map<string, number>()
    const flat = this.composite()
    for (let i = 0; i < flat.length; i += 4) {
      if (flat[i + 3] === 0) continue
      const hex = `#${[flat[i], flat[i + 1], flat[i + 2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
      counts.set(hex, (counts.get(hex) ?? 0) + 1)
    }
    const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([hex]) => hex)
    if (this.cached && this.cached.pixels === flatNow) this.cached.colors = colors
    return colors
  }
}
