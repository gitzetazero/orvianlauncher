import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { fromHsv } from './color'

const SIZE = 180

interface ColorWheelProps {
  hue: number
  saturation: number
  onChange: (hue: number, saturation: number) => void
}

/** Hue around the disc, saturation from the centre out; brightness is a separate slider. */
export function ColorWheel({ hue, saturation, onChange }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(SIZE, SIZE)
    const r = SIZE / 2
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const dx = x - r + 0.5
      const dy = y - r + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const i = (y * SIZE + x) * 4
      if (dist > r) continue
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
      const c = fromHsv(h, Math.min(1, dist / r), 1)
      image.data[i] = c.r
      image.data[i + 1] = c.g
      image.data[i + 2] = c.b
      // Soft edge
      image.data[i + 3] = Math.round(255 * Math.min(1, r - dist))
    }
    ctx.putImageData(image, 0, 0)
  }, [])

  const pick = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = ((event.clientX - rect.left) / rect.width) * SIZE - SIZE / 2
    const dy = ((event.clientY - rect.top) / rect.height) * SIZE - SIZE / 2
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
    onChange(h, Math.min(1, Math.sqrt(dx * dx + dy * dy) / (SIZE / 2)))
  }

  const angle = (hue * Math.PI) / 180
  const markerX = 50 + Math.cos(angle) * saturation * 50
  const markerY = 50 + Math.sin(angle) * saturation * 50

  return (
    <div className="color-wheel">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        role="slider"
        aria-label="Tono y saturación"
        aria-valuetext={`Tono ${Math.round(hue)} grados, saturación ${Math.round(saturation * 100)} %`}
        aria-valuenow={Math.round(hue)}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 15 : 5
          if (event.key === 'ArrowLeft') onChange((hue - step + 360) % 360, saturation)
          else if (event.key === 'ArrowRight') onChange((hue + step) % 360, saturation)
          else if (event.key === 'ArrowUp') onChange(hue, Math.min(1, saturation + 0.05))
          else if (event.key === 'ArrowDown') onChange(hue, Math.max(0, saturation - 0.05))
          else return
          event.preventDefault()
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          pick(event)
        }}
        onPointerMove={(event) => {
          if (event.buttons) pick(event)
        }}
      />
      <span className="color-wheel-marker" style={{ left: `${markerX}%`, top: `${markerY}%` }} aria-hidden="true" />
    </div>
  )
}
