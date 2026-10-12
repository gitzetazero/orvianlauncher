import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { box, faces, flatLayout, flatToTexture, PARTS, SIZE, type LayerKind, type PartId } from './layout'

interface Canvas2DProps {
  mode: 'flat' | 'texture'
  pixels: Uint8ClampedArray
  version: number
  slim: boolean
  target: LayerKind
  hidden: Set<PartId>
  grid: boolean
  zoom: number
  onStroke: (event: { x: number; y: number; inverse: boolean; phase: 'start' | 'move' }) => void
  onStrokeEnd: () => void
}

/** Size of the drawing in skin pixels: the whole texture, or the front figure. */
const extent = (mode: 'flat' | 'texture'): [number, number] => (mode === 'texture' ? [SIZE, SIZE] : [16, 32])

/**
 * The skin painted flat: either the raw 64×64 texture or the character seen from the front.
 * Same buttons as the 3D view: left paints, right runs the tool's inverse.
 */
export function Canvas2D({ mode, pixels, version, slim, target, hidden, grid, zoom, onStroke, onStrokeEnd }: Canvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [w, h] = extent(mode)
  const cell = Math.max(4, Math.round((mode === 'texture' ? 8 : 16) * zoom * 1.6))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = w * cell
    canvas.height = h * cell
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const source = document.createElement('canvas')
    source.width = SIZE
    source.height = SIZE
    source.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), SIZE, SIZE), 0, 0)

    if (mode === 'texture') {
      // Unused texture space is shaded so the usable faces stand out
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (const layer of ['base', 'overlay'] as const) {
        for (const part of PARTS) {
          for (const rect of Object.values(faces(box(part, layer, slim)))) {
            ctx.fillStyle = layer === target ? 'rgba(160, 81, 162, 0.12)' : 'rgba(255, 255, 255, 0.05)'
            ctx.fillRect(rect.x * cell, rect.y * cell, rect.w * cell, rect.h * cell)
          }
        }
      }
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    } else {
      for (const layer of target === 'overlay' ? (['base', 'overlay'] as const) : (['base'] as const)) {
        for (const { part, at } of flatLayout(slim)) {
          if (hidden.has(part)) continue
          const front = faces(box(part, layer, slim)).front
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
          if (layer === 'base') ctx.fillRect(at[0] * cell, at[1] * cell, front.w * cell, front.h * cell)
          ctx.drawImage(source, front.x, front.y, front.w, front.h, at[0] * cell, at[1] * cell, front.w * cell, front.h * cell)
        }
      }
    }

    if (grid) {
      ctx.strokeStyle = 'rgba(214, 200, 214, 0.18)'
      ctx.lineWidth = 1
      for (let x = 0; x <= w; x++) {
        ctx.beginPath()
        ctx.moveTo(x * cell + 0.5, 0)
        ctx.lineTo(x * cell + 0.5, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y <= h; y++) {
        ctx.beginPath()
        ctx.moveTo(0, y * cell + 0.5)
        ctx.lineTo(canvas.width, y * cell + 0.5)
        ctx.stroke()
      }
    }
  }, [mode, pixels, version, slim, target, hidden, grid, cell, w, h])

  const toTexture = (event: ReactPointerEvent<HTMLCanvasElement>): [number, number] | null => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fx = Math.floor(((event.clientX - rect.left) / rect.width) * w)
    const fy = Math.floor(((event.clientY - rect.top) / rect.height) * h)
    if (fx < 0 || fy < 0 || fx >= w || fy >= h) return null
    if (mode === 'texture') return [fx, fy]
    const at = flatToTexture(fx, fy, target, slim)
    if (!at) return null
    // A hidden part cannot be painted from the flat figure either
    const part = flatLayout(slim).find(({ part: id, at: origin }) => {
      const front = faces(box(id, target, slim)).front
      return fx >= origin[0] && fy >= origin[1] && fx < origin[0] + front.w && fy < origin[1] + front.h
    })?.part
    return part && hidden.has(part) ? null : at
  }

  return (
    <div className="editor-2d">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={mode === 'texture' ? 'Textura de la skin en 2D' : 'La skin vista de frente'}
        style={{ width: w * cell, height: 'auto', aspectRatio: `${w} / ${h}` }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button === 1) return
          const at = toTexture(event)
          if (!at) return
          event.currentTarget.setPointerCapture(event.pointerId)
          onStroke({ x: at[0], y: at[1], inverse: event.button === 2, phase: 'start' })
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return
          const at = toTexture(event)
          if (at) onStroke({ x: at[0], y: at[1], inverse: (event.buttons & 2) !== 0, phase: 'move' })
        }}
        onPointerUp={onStrokeEnd}
        onPointerCancel={onStrokeEnd}
      />
    </div>
  )
}
