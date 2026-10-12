import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nativeImage, protocol } from 'electron'
import { assertInside, isSafeFileName } from '../src/shared/paths'
import { log } from './logger'
import { TEXTURE_HASH } from './skinHistory'

/**
 * `orvian-media://` serves the player's own images (screenshots and saved skins) to the windows.
 * The CSP only allows images from the app, a few CDNs and this scheme, and the handler only ever
 * reads plain file names inside the two folders it knows about.
 */

export const MEDIA_SCHEME = 'orvian-media'
export const SCREENSHOT_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const
const SKIN_ID = /^[a-f0-9-]{36}$/
const THUMB_WIDTH = 480

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
}

export function screenshotUrl(file: string, kind: 'full' | 'thumb', version: number): string {
  return `${MEDIA_SCHEME}://${kind === 'thumb' ? 'thumb' : 'screenshot'}/${encodeURIComponent(file)}?v=${Math.round(version)}`
}

export function historyUrl(hash: string): string {
  return `${MEDIA_SCHEME}://history/${hash}.png`
}

export function skinUrl(id: string, version: number): string {
  return `${MEDIA_SCHEME}://skin/${id}.png?v=${Math.round(version)}`
}

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

function contentType(file: string): string {
  const lower = file.toLowerCase()
  return Object.entries(TYPES).find(([ext]) => lower.endsWith(ext))?.[1] ?? 'application/octet-stream'
}

function notFound(): Response {
  return new Response('No encontrado', { status: 404 })
}

export function registerMediaProtocol(dataRoot: string): void {
  const screenshots = join(dataRoot, 'instances', 'orvian', 'screenshots')
  const skins = join(dataRoot, 'launcher', 'skins')
  const thumbs = join(dataRoot, 'launcher', 'cache', 'thumbs')

  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const name = decodeURIComponent(url.pathname.replace(/^\//, ''))

      if (url.hostname === 'history') {
        const hash = name.replace(/\.png$/, '')
        if (!TEXTURE_HASH.test(hash)) return notFound()
        const history = join(skins, 'history')
        const body = await readFile(assertInside(history, join(history, `${hash}.png`)))
        return new Response(new Uint8Array(body), { headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' } })
      }

      if (url.hostname === 'skin') {
        const id = name.replace(/\.png$/, '')
        if (!SKIN_ID.test(id)) return notFound()
        const body = await readFile(assertInside(skins, join(skins, `${id}.png`)))
        return new Response(new Uint8Array(body), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' } })
      }

      if (url.hostname !== 'screenshot' && url.hostname !== 'thumb') return notFound()
      if (!isSafeFileName(name, SCREENSHOT_EXTENSIONS)) return notFound()
      const path = assertInside(screenshots, join(screenshots, name))

      if (url.hostname === 'screenshot') {
        return new Response(new Uint8Array(await readFile(path)), { headers: { 'Content-Type': contentType(name) } })
      }

      // Thumbnails are made once per file version and cached, so the gallery never decodes full captures
      const info = await stat(path)
      const key = createHash('sha1').update(`${name}:${info.mtimeMs}:${info.size}`).digest('hex')
      const cached = join(thumbs, `${key}.jpg`)
      const existing = await readFile(cached).catch(() => null)
      if (existing) return new Response(new Uint8Array(existing), { headers: { 'Content-Type': 'image/jpeg' } })

      const image = nativeImage.createFromPath(path)
      if (image.isEmpty()) return notFound()
      const thumb = image.getSize().width > THUMB_WIDTH ? image.resize({ width: THUMB_WIDTH, quality: 'good' }) : image
      const jpeg = thumb.toJPEG(80)
      await mkdir(thumbs, { recursive: true })
      await writeFile(cached, jpeg).catch(() => undefined)
      return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } })
    } catch (err) {
      log.debug('[media] %s', String(err))
      return notFound()
    }
  })
}
