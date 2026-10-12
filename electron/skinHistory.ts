import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkinVariant } from '../src/shared/ipc-contract'
import { assertInside } from '../src/shared/paths'
import { isMinecraftSkinSize, readPngSize } from '../src/shared/png'
import { log } from './logger'
import { fetchWithTimeout, getUserAgent } from './net'

/**
 * Every skin the account has worn, gathered from what this launcher sees itself and from the public
 * histories of LabyNet, Crafty.gg and NameMC. Each service names textures its own way, so the same
 * skin is recognised by its pixels and kept once, with the widest date range any source knows.
 * A date of 0 means no source knows when it was worn (NameMC lists skins without dates).
 */

export type HistorySource = 'launcher' | 'crafty' | 'labynet' | 'namemc'

export interface HistoryEntry {
  /** File name of the texture: Mojang's hash, or `laby-` plus LabyNet's hash. */
  hash: string
  variant: SkinVariant
  firstSeenAt: number
  lastSeenAt: number
  /** Where it was first found; kept for older entries that predate `sources`. */
  source?: HistorySource
  /** Every source that knows this skin. */
  sources?: HistorySource[]
  /** Hash of the decoded pixels, so the same image from two services is one entry. */
  pixels?: string
}

interface HistoryFile {
  current: string | null
  entries: HistoryEntry[]
  /** Last time the public histories were merged in, to respect the services' limits. */
  remoteSyncedAt?: number
}

/** A past skin reported by a public history service. */
export interface RemoteSkin {
  key: string
  url: string
  variant: SkinVariant
  firstSeenAt: number
  lastSeenAt: number
  source: HistorySource
  /** Texture already downloaded by the caller (NameMC's images need the window that passed its check). */
  bytes?: Uint8Array
}

const MAX_ENTRIES = 150
const MAX_SKIN_BYTES = 256 * 1024
export const TEXTURE_HASH = /^(?:laby-[0-9a-f]{32}|namemc-[0-9a-f]{16,32}|[0-9a-f]{32,128})$/
const MOJANG_TEXTURE = 'https://textures.minecraft.net/texture/'
const LABY_TEXTURE = 'https://texture.laby.net/'

/** Mojang names each texture by its content hash: the last segment of the texture link. */
export function textureHash(url: string): string | null {
  const hash = url.split('/').pop()?.toLowerCase() ?? ''
  return /^[0-9a-f]{40,128}$/.test(hash) ? hash : null
}

const date = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) : Number.NaN)

/** Crafty.gg `/api/v2/players/{uuid}`: Mojang texture hash, arm model and when the player changed to it. */
export function parseCraftySkins(body: unknown): RemoteSkin[] {
  const skins = (body as { data?: { skins?: unknown } } | null)?.data?.skins
  if (!Array.isArray(skins)) return []
  return skins.flatMap((raw) => {
    const skin = raw as { hash?: unknown; slim?: unknown; changed_at?: unknown; created_at?: unknown }
    const hash = typeof skin.hash === 'string' ? skin.hash.toLowerCase() : ''
    const when = Number.isNaN(date(skin.changed_at)) ? date(skin.created_at) : date(skin.changed_at)
    if (!/^[0-9a-f]{40,128}$/.test(hash) || Number.isNaN(when)) return []
    return [{ key: hash, url: MOJANG_TEXTURE + hash, variant: skin.slim === true ? 'slim' : 'classic', firstSeenAt: when, lastSeenAt: when, source: 'crafty' as const }]
  })
}

/** LabyNet `/api/v3/user/{uuid}/textures`: its own image hash, first and last time it saw the skin. */
export function parseLabySkins(body: unknown): RemoteSkin[] {
  const skins = (body as { SKIN?: unknown } | null)?.SKIN
  if (!Array.isArray(skins)) return []
  return skins.flatMap((raw) => {
    const skin = raw as { image_hash?: unknown; slim_skin?: unknown; first_seen_at?: unknown; last_seen_at?: unknown }
    const hash = typeof skin.image_hash === 'string' ? skin.image_hash.toLowerCase() : ''
    const first = date(skin.first_seen_at)
    const last = date(skin.last_seen_at)
    if (!/^[0-9a-f]{32}$/.test(hash) || (Number.isNaN(first) && Number.isNaN(last))) return []
    const firstSeenAt = Number.isNaN(first) ? last : first
    return [{ key: `laby-${hash}`, url: `${LABY_TEXTURE}${hash}.png`, variant: skin.slim_skin === true ? 'slim' : 'classic', firstSeenAt, lastSeenAt: Number.isNaN(last) ? firstSeenAt : last, source: 'labynet' as const }]
  })
}

const sourcesOf = (entry: HistoryEntry): HistorySource[] => entry.sources ?? (entry.source ? [entry.source] : ['launcher'])

/** Earliest of two dates, where 0 is "unknown" and never wins over a real date. */
const earliest = (a: number, b: number): number => (a > 0 && b > 0 ? Math.min(a, b) : Math.max(a, b))

/** Folds what another source knows about a skin into an entry: widest dates, all sources. */
export function combine(entry: HistoryEntry, firstSeenAt: number, lastSeenAt: number, source: HistorySource): HistoryEntry {
  const sources = sourcesOf(entry)
  return {
    ...entry,
    firstSeenAt: earliest(entry.firstSeenAt, firstSeenAt),
    lastSeenAt: Math.max(entry.lastSeenAt, lastSeenAt),
    sources: sources.includes(source) ? sources : [...sources, source]
  }
}

function isEntry(value: unknown): value is HistoryEntry {
  const v = value as Partial<HistoryEntry> | null
  return Boolean(v) && typeof v?.hash === 'string' && TEXTURE_HASH.test(v.hash) && (v.variant === 'classic' || v.variant === 'slim') && typeof v.firstSeenAt === 'number' && typeof v.lastSeenAt === 'number'
}

/** Decoded-pixel fingerprint of a PNG; injected so tests do not need Electron. */
export type PixelHasher = (png: Uint8Array) => string | null

/** In the app: Electron decodes the PNG and the raw bitmap is hashed. */
export function electronPixelHasher(png: Uint8Array): string | null {
  // Loaded lazily: this module is also used by unit tests, where Electron is not running
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nativeImage } = require('electron') as typeof import('electron')
  const image = nativeImage.createFromBuffer(Buffer.from(png))
  if (image.isEmpty()) return null
  return createHash('sha1').update(image.toBitmap()).digest('hex')
}

export class SkinHistory {
  private readonly dir: string
  private readonly file: string
  private queue: Promise<unknown> = Promise.resolve()

  constructor(dataRoot: string, private readonly now: () => number = Date.now, private readonly hashPixels: PixelHasher = electronPixelHasher) {
    this.dir = join(dataRoot, 'launcher', 'skins', 'history')
    this.file = join(this.dir, 'history.json')
  }

  pathOf(hash: string): string {
    if (!TEXTURE_HASH.test(hash)) throw new Error('Skin del historial no válida.')
    return assertInside(this.dir, join(this.dir, `${hash}.png`))
  }

  async read(): Promise<HistoryFile> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<HistoryFile>
      const entries = Array.isArray(parsed.entries) ? parsed.entries.filter(isEntry) : []
      return { current: typeof parsed.current === 'string' ? parsed.current : null, entries, remoteSyncedAt: typeof parsed.remoteSyncedAt === 'number' ? parsed.remoteSyncedAt : undefined }
    } catch {
      return { current: null, entries: [] }
    }
  }

  async remoteSyncedAt(): Promise<number> {
    return (await this.read()).remoteSyncedAt ?? 0
  }

  private serial<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Records that the account wears the skin at `url` now. */
  record(url: string, variant: SkinVariant): Promise<void> {
    return this.serial(async () => {
      const key = textureHash(url)
      if (!key) return
      const file = await this.read()
      const now = this.now()
      let index = file.entries.findIndex((entry) => entry.hash === key)
      if (index < 0) {
        const added = await this.fetchSkin(url, key)
        if (!added) return
        index = await this.findSamePixels(file, added.pixels)
        if (index < 0) {
          file.entries.push({ hash: key, variant, firstSeenAt: now, lastSeenAt: now, sources: ['launcher'], pixels: added.pixels ?? undefined })
          index = file.entries.length - 1
          log.info('[Skins] Nueva skin en el historial')
        }
      }
      file.entries[index] = { ...combine(file.entries[index], now, now, 'launcher'), variant }
      file.current = file.entries[index].hash
      await this.save(file)
    })
  }

  /**
   * Merges skins from the public histories, downloading each texture the first time. `automatic`
   * marks the LabyNet/Crafty.gg sync done, so it is not repeated for a few hours.
   */
  mergeRemote(remote: RemoteSkin[], automatic = true): Promise<number> {
    return this.serial(async () => {
      const file = await this.read()
      let added = 0
      for (const skin of remote) {
        let index = file.entries.findIndex((entry) => entry.hash === skin.key)
        if (index < 0) {
          const fetched = skin.bytes ? await this.storeSkin(skin.bytes, skin.key) : await this.fetchSkin(skin.url, skin.key)
          if (!fetched) continue
          index = await this.findSamePixels(file, fetched.pixels)
          if (index < 0) {
            file.entries.push({ hash: skin.key, variant: skin.variant, firstSeenAt: skin.firstSeenAt, lastSeenAt: skin.lastSeenAt, sources: [skin.source], pixels: fetched.pixels ?? undefined })
            added++
            continue
          }
          // Same image under another service's name: the copy just downloaded is not needed
          await rm(this.pathOf(skin.key), { force: true })
        }
        file.entries[index] = combine(file.entries[index], skin.firstSeenAt, skin.lastSeenAt, skin.source)
      }
      if (automatic) file.remoteSyncedAt = this.now()
      await this.save(file)
      return added
    })
  }

  remove(hash: string): Promise<void> {
    return this.serial(async () => {
      const file = await this.read()
      await this.save({ ...file, entries: file.entries.filter((entry) => entry.hash !== hash) })
      await rm(this.pathOf(hash), { force: true })
    })
  }

  /** Index of an entry with the same pixels, filling in fingerprints of older entries on the way. */
  private async findSamePixels(file: HistoryFile, pixels: string | null): Promise<number> {
    if (!pixels) return -1
    for (let i = 0; i < file.entries.length; i++) {
      const entry = file.entries[i]
      if (!entry.pixels) {
        const bytes = await readFile(this.pathOf(entry.hash)).catch(() => null)
        file.entries[i] = { ...entry, pixels: bytes ? (this.hashPixels(new Uint8Array(bytes)) ?? undefined) : undefined }
      }
      if (file.entries[i].pixels === pixels) return i
    }
    return -1
  }

  private async fetchSkin(url: string, key: string): Promise<{ pixels: string | null } | null> {
    const response = await fetchWithTimeout(url, { headers: { 'User-Agent': getUserAgent() } }, 15_000).catch(() => null)
    if (!response?.ok) return null
    return this.storeSkin(new Uint8Array(await response.arrayBuffer()), key)
  }

  private async storeSkin(bytes: Uint8Array, key: string): Promise<{ pixels: string | null } | null> {
    if (bytes.byteLength > MAX_SKIN_BYTES || !isMinecraftSkinSize(readPngSize(bytes))) return null
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.pathOf(key), bytes)
    return { pixels: this.hashPixels(bytes) }
  }

  private async save(file: HistoryFile): Promise<void> {
    const sorted = [...file.entries].sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    const kept = sorted.slice(0, MAX_ENTRIES)
    for (const old of sorted.slice(MAX_ENTRIES)) if (old.hash !== file.current) await rm(this.pathOf(old.hash), { force: true })
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file, JSON.stringify({ ...file, entries: kept }, null, 2), 'utf8')
  }
}
