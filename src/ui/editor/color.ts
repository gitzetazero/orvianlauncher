export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

export const clamp = (n: number, min = 0, max = 255): number => Math.min(max, Math.max(min, n))

export function toHex({ r, g, b }: RGBA): string {
  return `#${[r, g, b].map((n) => Math.round(clamp(n)).toString(16).padStart(2, '0')).join('')}`
}

export function fromHex(hex: string): RGBA | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 }
}

/** Hue in degrees, saturation and value from 0 to 1. */
export function toHsv({ r, g, b }: RGBA): { h: number; s: number; v: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export function fromHsv(h: number, s: number, v: number): RGBA {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a: 255 }
}

/** Nine steps from dark to light around a colour, for the shades row. */
export function shades(color: RGBA): RGBA[] {
  const { h, s } = toHsv(color)
  return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    // Darker shades keep saturation, lighter ones wash out towards white
    return fromHsv(h, s * (t < 0.5 ? 1 : 1 - (t - 0.5) * 1.4), 0.18 + t * 0.82)
  })
}

/** Lighter or darker by a few steps of value, for the shade tool. */
export function shade(color: RGBA, amount: number): RGBA {
  const { h, s, v } = toHsv(color)
  return { ...fromHsv(h, s, clamp(v + amount, 0, 1)), a: color.a }
}

export const PALETTES: Array<{ id: string; label: string; colors: string[] }> = [
  { id: 'skin', label: 'Tonos de piel', colors: ['#3b2219', '#5c3a2a', '#7d4f3a', '#9b6a4f', '#b8835e', '#c99772', '#d9ad8a', '#e8c4a2', '#f3d9bf', '#fbe9d7'] },
  { id: 'hair', label: 'Pelo', colors: ['#120d0b', '#2b1d14', '#4a2f1f', '#6e4428', '#93603a', '#b8864f', '#d9b36b', '#e8d29a', '#a33a23', '#d06a2c'] },
  { id: 'steve', label: 'Steve', colors: ['#2a1d10', '#3f2a15', '#6a4a30', '#b4806a', '#c69580', '#00a8a8', '#00787a', '#463aa5', '#2f2876', '#5f5f5f'] },
  { id: 'alex', label: 'Alex', colors: ['#e98536', '#c2611d', '#f0b07c', '#e4bfa0', '#6e9b48', '#4e7234', '#835a35', '#5b3c22', '#f2e2c8', '#3b2c1f'] },
  { id: 'grey', label: 'Escala de grises', colors: ['#000000', '#1c1c1c', '#383838', '#555555', '#717171', '#8e8e8e', '#aaaaaa', '#c6c6c6', '#e3e3e3', '#ffffff'] },
  { id: 'denim', label: 'Vaqueros y cuero', colors: ['#1d2a44', '#2b3e63', '#3d5687', '#5b78a8', '#8aa3c8', '#3a2414', '#5a3920', '#7c522f', '#9e6c40', '#c08b57'] },
  { id: 'nature', label: 'Naturaleza', colors: ['#1f3b17', '#2f5a22', '#45802f', '#69a83f', '#9bcf5a', '#5a4022', '#7a5a33', '#8d8d8d', '#3e7fb3', '#7ec2e0'] },
  { id: 'neon', label: 'Neón', colors: ['#ff2e88', '#ff5f1f', '#ffe11f', '#7dff2e', '#1fffc9', '#1fb4ff', '#6b3bff', '#d12eff', '#ffffff', '#111111'] },
  { id: 'pastel', label: 'Pastel', colors: ['#ffd1dc', '#ffe5b4', '#fffacd', '#d5f5c4', '#c9f2ec', '#c7dcff', '#e0d1ff', '#f6d3f0', '#f1f1f1', '#d9d3cc'] }
]
