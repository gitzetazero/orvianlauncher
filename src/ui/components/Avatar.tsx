import { useEffect, useState } from 'react'
import { overlayIsUsed } from './skinPixels'

const heads = new Map<string, Promise<string | null>>()

/** Face plus hat layer of a skin texture, as a small PNG data URL. Mojang's texture host allows CORS. */
function renderHead(textureUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8)
      if (overlayIsUsed(image, 40, 8, 8, 8)) ctx.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8)
      try {
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = textureUrl
  })
}

/** The player's head from their real skin, worked out once per player and shared by every avatar on screen. */
function playerHead(uuid: string): Promise<string | null> {
  const key = uuid.replace(/-/g, '').toLowerCase()
  let found = heads.get(key)
  if (!found) {
    found = window.orvian
      .getSkinTexture(key)
      .then((url) => (url ? renderHead(url) : null))
      .catch(() => null)
    heads.set(key, found)
  }
  return found
}

/**
 * Player head drawn from the account's real skin (face and hat layer). Falls back to minotar's render,
 * then to the initial, when offline or when a service does not answer.
 */
export function Avatar({ uuid, name, size = 20 }: { uuid?: string | null; name?: string | null; size?: 20 | 32 | 48 }) {
  const [head, setHead] = useState<string | null | undefined>(undefined)
  const [fallbackFailed, setFallbackFailed] = useState(false)
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?'

  useEffect(() => {
    if (!uuid) return
    let cancelled = false
    setHead(undefined)
    setFallbackFailed(false)
    void playerHead(uuid).then((value) => !cancelled && setHead(value))
    return () => {
      cancelled = true
    }
  }, [uuid])

  const fallback = uuid && head === null && !fallbackFailed ? `https://minotar.net/helm/${uuid.replace(/-/g, '')}/${size * 2}.png` : null
  const src = head ?? fallback

  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      {src ? (
        <img src={src} alt="" width={size} height={size} draggable={false} onError={() => (head ? setHead(null) : setFallbackFailed(true))} />
      ) : (
        <span className="avatar-initial" style={{ fontSize: Math.round(size * 0.5) }}>{head === undefined && uuid ? '' : initial}</span>
      )}
    </span>
  )
}
