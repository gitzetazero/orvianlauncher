import { useEffect, useRef, useState } from 'react'
import type { SkinVariant } from '../../shared/ipc-contract'
import { overlayIsUsed } from './skinPixels'

/**
 * Flat render of a Minecraft skin, front or back, drawn from the texture's own pixels on a canvas.
 * Layout in skin pixels: 16 wide × 32 tall; overlays (hat, jacket, sleeves, trousers) on top.
 */

type Rect = [sx: number, sy: number, w: number, h: number]
interface Part {
  base: Rect
  overlay?: Rect
  at: [x: number, y: number]
  /** Legacy 64×32 skins have one arm and one leg: the other side is that texture mirrored. */
  mirrorOf?: Rect
}

function parts(view: 'front' | 'back', slim: boolean, legacy: boolean): Part[] {
  const arm = slim ? 3 : 4
  // Columns of the drawing: the right arm is on the viewer's left when facing the front
  const leftCol = 4 - arm
  if (view === 'front') {
    return [
      { base: [8, 8, 8, 8], overlay: [40, 8, 8, 8], at: [4, 0] },
      { base: [20, 20, 8, 12], overlay: legacy ? undefined : [20, 36, 8, 12], at: [4, 8] },
      { base: [44, 20, arm, 12], overlay: legacy ? undefined : [44, 36, arm, 12], at: [leftCol, 8] },
      legacy ? { base: [44, 20, arm, 12], mirrorOf: [44, 20, arm, 12], at: [12, 8] } : { base: [36, 52, arm, 12], overlay: [52, 52, arm, 12], at: [12, 8] },
      { base: [4, 20, 4, 12], overlay: legacy ? undefined : [4, 36, 4, 12], at: [4, 20] },
      legacy ? { base: [4, 20, 4, 12], mirrorOf: [4, 20, 4, 12], at: [8, 20] } : { base: [20, 52, 4, 12], overlay: [4, 52, 4, 12], at: [8, 20] }
    ]
  }
  const backArm = slim ? 51 : 52
  const backLeftArm = slim ? 43 : 44
  return [
    { base: [24, 8, 8, 8], overlay: [56, 8, 8, 8], at: [4, 0] },
    { base: [32, 20, 8, 12], overlay: legacy ? undefined : [32, 36, 8, 12], at: [4, 8] },
    // From behind, the left arm is on the viewer's left
    legacy ? { base: [backArm, 20, arm, 12], mirrorOf: [backArm, 20, arm, 12], at: [leftCol, 8] } : { base: [backLeftArm, 52, arm, 12], overlay: [backLeftArm + 16, 52, arm, 12], at: [leftCol, 8] },
    { base: [backArm, 20, arm, 12], overlay: legacy ? undefined : [backArm, 36, arm, 12], at: [12, 8] },
    legacy ? { base: [12, 20, 4, 12], mirrorOf: [12, 20, 4, 12], at: [4, 20] } : { base: [28, 52, 4, 12], overlay: [12, 52, 4, 12], at: [4, 20] },
    { base: [12, 20, 4, 12], overlay: legacy ? undefined : [12, 36, 4, 12], at: [8, 20] }
  ]
}

function drawRect(ctx: CanvasRenderingContext2D, image: HTMLImageElement, [sx, sy, w, h]: Rect, x: number, y: number, scale: number, mirror: boolean): void {
  if (mirror) {
    ctx.save()
    ctx.translate((x + w) * scale, y * scale)
    ctx.scale(-1, 1)
    ctx.drawImage(image, sx, sy, w, h, 0, 0, w * scale, h * scale)
    ctx.restore()
  } else {
    ctx.drawImage(image, sx, sy, w, h, x * scale, y * scale, w * scale, h * scale)
  }
}

function useImage(src: string | null): { image: HTMLImageElement | null; failed: boolean } {
  const [state, setState] = useState<{ image: HTMLImageElement | null; failed: boolean }>({ image: null, failed: false })
  useEffect(() => {
    if (!src) {
      setState({ image: null, failed: false })
      return
    }
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    // Mojang's texture host and the launcher's own media scheme both allow CORS, so pixels can be read
    img.crossOrigin = 'anonymous'
    img.onload = () => !cancelled && setState({ image: img, failed: false })
    img.onerror = () => !cancelled && setState({ image: null, failed: true })
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src])
  return state
}

interface SkinViewerProps {
  src: string | null
  variant: SkinVariant
  view?: 'front' | 'back'
  /** Size of one skin pixel on screen. */
  scale?: number
  capeSrc?: string | null
  label: string
  className?: string
}

export function SkinViewer({ src, variant, view = 'front', scale = 8, capeSrc = null, label, className }: SkinViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { image, failed } = useImage(src)
  const { image: cape } = useImage(capeSrc)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = false
    if (!image) return
    const legacy = image.naturalHeight === 32
    for (const part of parts(view, variant === 'slim', legacy)) {
      drawRect(ctx, image, part.base, part.at[0], part.at[1], scale, Boolean(part.mirrorOf))
      if (part.overlay && overlayIsUsed(image, ...part.overlay)) drawRect(ctx, image, part.overlay, part.at[0], part.at[1], scale, false)
    }
    // Seen from behind, the cape hangs over the torso and the upper legs; its outer face starts at (1, 1)
    if (cape && view === 'back') {
      const unit = cape.naturalWidth / 64
      ctx.drawImage(cape, 1 * unit, 1 * unit, 10 * unit, 16 * unit, 3 * scale, 8 * scale, 10 * scale, 16 * scale)
    }
  }, [image, cape, view, variant, scale])

  return (
    <div className={className ?? 'skin-viewer'}>
      <canvas ref={canvasRef} width={16 * scale} height={32 * scale} role="img" aria-label={label} />
      {failed && <span className="skin-viewer-error">No se pudo cargar la skin</span>}
    </div>
  )
}

/** The front face of a cape texture, enlarged. */
export function CapePreview({ src, label, scale = 4 }: { src: string; label: string; scale?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { image } = useImage(src)
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !canvasRef.current) return
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    ctx.imageSmoothingEnabled = false
    // Cape textures are 64×32, or 22×17 multiples in older capes; the outer face starts at (1, 1)
    if (image) {
      const unit = image.naturalWidth / 64
      ctx.drawImage(image, 1 * unit, 1 * unit, 10 * unit, 16 * unit, 0, 0, 10 * scale, 16 * scale)
    }
  }, [image, scale])
  return <canvas ref={canvasRef} width={10 * scale} height={16 * scale} role="img" aria-label={label} className="cape-canvas" />
}
