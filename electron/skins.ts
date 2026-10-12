import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import type { SkinHistoryItem, SkinLibraryItem, SkinProfile, SkinVariant } from '../src/shared/ipc-contract'
import { assertInside } from '../src/shared/paths'
import { isMinecraftSkinSize, readPngSize } from '../src/shared/png'
import type { AccountInfo } from './auth'
import { getConfig } from './config'
import type { Ipc } from './ipc'
import { log } from './logger'
import { historyUrl, skinUrl } from './media'
import { readNameMcSkins } from './nameMc'
import { parseCraftySkins, parseLabySkins, SkinHistory, TEXTURE_HASH, type RemoteSkin } from './skinHistory'
import { fetchWithTimeout, getUserAgent } from './net'

/**
 * The Locker: the account's skin and capes through the official Minecraft services API, plus a
 * local library of skin files the player saved, so switching outfits never needs a browser.
 */

const API = 'https://api.minecraftservices.com/minecraft/profile'
const SESSION_PROFILE = 'https://sessionserver.mojang.com/session/minecraft/profile/'
/** Crafty.gg's public player API: skin history with dates, rate limited by the service (150/min). */
const CRAFTY_PLAYER = 'https://api.crafty.gg/api/v2/players/'
/** LabyNet's public texture history: first and last time each skin was seen (10 requests a minute). */
const LABY_TEXTURES = (uuid: string): string => `https://laby.net/api/v3/user/${uuid}/textures`
const REMOTE_SYNC_MS = 6 * 60 * 60_000
const NAME_LOOKUP = 'https://api.mojang.com/users/profiles/minecraft/'
const TEXTURE_CACHE_MS = 10 * 60_000
const TEXTURE_HOSTS = ['textures.minecraft.net']
const MAX_SKIN_BYTES = 256 * 1024
const MAX_LIBRARY = 60

export interface SkinDeps {
  dataRoot: string
  getSession: () => Promise<{ account: AccountInfo; stale: boolean }>
  onSkinChanged: () => void
}

interface StoredSkin {
  id: string
  name: string
  variant: SkinVariant
  addedAt: number
  favorite: boolean
}

interface ApiProfile {
  name?: string
  skins?: Array<{ id?: string; state?: string; url?: string; variant?: string }>
  capes?: Array<{ id?: string; state?: string; url?: string; alias?: string }>
}

/** Texture links come back as http; only Mojang's texture host is accepted, always over https. */
export function textureUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    if (!TEXTURE_HOSTS.includes(url.hostname.toLowerCase())) return null
    url.protocol = 'https:'
    return url.href
  } catch {
    return null
  }
}

export function toSkinProfile(data: ApiProfile, fallbackName: string): SkinProfile {
  const active = data.skins?.find((skin) => skin.state === 'ACTIVE')
  const activeUrl = textureUrl(active?.url)
  return {
    name: data.name ?? fallbackName,
    skin: activeUrl ? { url: activeUrl, variant: active?.variant?.toUpperCase() === 'SLIM' ? 'slim' : 'classic' } : null,
    capes: (data.capes ?? []).flatMap((cape) => {
      const url = textureUrl(cape.url)
      return cape.id && url ? [{ id: cape.id, alias: cape.alias ?? 'Capa', url, active: cape.state === 'ACTIVE' }] : []
    })
  }
}

function apiError(status: number): Error {
  if (status === 401) return new Error('Tu sesión de Minecraft ha caducado. Vuelve a iniciar sesión.')
  if (status === 429) return new Error('Minecraft limita los cambios seguidos. Espera un minuto e inténtalo de nuevo.')
  if (status === 400) return new Error('Minecraft no aceptó la skin. Comprueba que es un PNG de 64×64 o 64×32.')
  return new Error(`Los servicios de Minecraft respondieron con un error (${status}). Inténtalo más tarde.`)
}

/** The skin inside a public session profile (`properties[].textures`, base64 JSON): link and arm model. */
export function skinTextureFromSession(data: unknown): { url: string; variant: SkinVariant } | null {
  const properties = (data as { properties?: Array<{ name?: string; value?: string }> } | null)?.properties ?? []
  const textures = properties.find((property) => property.name === 'textures')?.value
  if (!textures) return null
  try {
    const decoded = JSON.parse(Buffer.from(textures, 'base64').toString('utf8')) as { textures?: { SKIN?: { url?: string; metadata?: { model?: string } } } }
    const url = textureUrl(decoded.textures?.SKIN?.url)
    return url ? { url, variant: decoded.textures?.SKIN?.metadata?.model === 'slim' ? 'slim' : 'classic' } : null
  } catch {
    return null
  }
}

/** The skin texture link inside a public session profile. */
export function skinFromSessionProfile(data: unknown): string | null {
  return skinTextureFromSession(data)?.url ?? null
}

export interface SkinsApi {
  /** Records the skin the account wears now in the history (public profile, no session needed). */
  recordAccountSkin: (uuid: string) => Promise<void>
}

export function registerSkinsIpc(ipc: Ipc, deps: SkinDeps): SkinsApi {
  const history = new SkinHistory(deps.dataRoot)
  // Public skins for avatars: no session needed, cached briefly so every window opening does not refetch
  const heads = new Map<string, { url: string | null; at: number }>()
  ipc.handle('skins:texture', [z.string().regex(/^[0-9a-f]{32}$/i)], async (_event, uuid) => {
    const key = uuid.toLowerCase()
    const cached = heads.get(key)
    if (cached && Date.now() - cached.at < TEXTURE_CACHE_MS) return cached.url
    try {
      const response = await fetchWithTimeout(SESSION_PROFILE + key, { headers: { Accept: 'application/json', 'User-Agent': getUserAgent() } }, 10_000)
      const url = response.ok ? skinFromSessionProfile(await response.json()) : null
      heads.set(key, { url, at: Date.now() })
      return url
    } catch {
      return null
    }
  })

  const dir = join(deps.dataRoot, 'launcher', 'skins')
  const indexFile = join(dir, 'index.json')

  const readIndex = async (): Promise<StoredSkin[]> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(indexFile, 'utf8'))
      if (!Array.isArray(parsed)) return []
      return parsed.filter((item): item is StoredSkin =>
        Boolean(item) && typeof item.id === 'string' && /^[a-f0-9-]{36}$/.test(item.id) && typeof item.name === 'string' && (item.variant === 'classic' || item.variant === 'slim') && typeof item.addedAt === 'number'
      ).map((item) => ({ ...item, favorite: item.favorite === true }))
    } catch {
      return []
    }
  }
  const writeIndex = async (items: StoredSkin[]): Promise<void> => {
    await mkdir(dir, { recursive: true })
    await writeFile(indexFile, JSON.stringify(items, null, 2), 'utf8')
  }
  const filePath = (id: string): string => assertInside(dir, join(dir, `${id}.png`))
  const toItem = async (skin: StoredSkin): Promise<SkinLibraryItem> => {
    const info = await stat(filePath(skin.id)).catch(() => null)
    return { ...skin, url: skinUrl(skin.id, info?.mtimeMs ?? skin.addedAt) }
  }

  // Library writes share one file: run them one after another
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job)
    queue = run.catch(() => undefined)
    return run
  }

  const authorized = async (): Promise<{ token: string; name: string }> => {
    const { account } = await deps.getSession()
    return { token: account.accessToken, name: account.name }
  }

  const fetchProfile = async (): Promise<SkinProfile> => {
    // Development test profile: no session, so its public skin stands in for the account's
    const test = getConfig().testAccount
    if (test) {
      const session = await fetchWithTimeout(SESSION_PROFILE + test.uuid, { headers: { Accept: 'application/json', 'User-Agent': getUserAgent() } }, 10_000)
      return { name: test.name, skin: session.ok ? skinTextureFromSession(await session.json()) : null, capes: [] }
    }
    const { token, name } = await authorized()
    const response = await fetchWithTimeout(API, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': getUserAgent() } })
    if (!response.ok) throw apiError(response.status)
    const profile = toSkinProfile((await response.json()) as ApiProfile, name)
    if (profile.skin) await history.record(profile.skin.url, profile.skin.variant).catch((err: unknown) => log.warn('[Skins] Historial no actualizado: %s', String(err)))
    return profile
  }

  /** Uploads PNG bytes as the account's skin. */
  const uploadSkin = async (bytes: Uint8Array, variant: SkinVariant): Promise<void> => {
    const { token } = await authorized()
    const form = new FormData()
    form.append('variant', variant)
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'skin.png')
    const response = await fetchWithTimeout(`${API}/skins`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'User-Agent': getUserAgent() }, body: form }, 30_000)
    if (!response.ok) throw apiError(response.status)
    log.info('[Skins] Skin aplicada (%s)', variant)
    deps.onSkinChanged()
  }

  const historyEntry = async (hash: string): Promise<{ bytes: Uint8Array; variant: SkinVariant; firstSeenAt: number }> => {
    const entry = (await history.read()).entries.find((item) => item.hash === hash)
    if (!entry) throw new Error('Esa skin ya no está en tu historial.')
    return { bytes: new Uint8Array(await readFile(history.pathOf(hash))), variant: entry.variant, firstSeenAt: entry.firstSeenAt }
  }

  /** Brings in the skins Crafty.gg has seen on this account; at most every few hours unless forced. */
  const syncRemote = async (uuid: string, force: boolean): Promise<void> => {
    if (!force && Date.now() - (await history.remoteSyncedAt()) < REMOTE_SYNC_MS) return
    const dashed = uuid.replace(/-/g, '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
    const ask = async (name: string, url: string, parse: (body: unknown) => RemoteSkin[]): Promise<RemoteSkin[]> => {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': getUserAgent() } }, 15_000)
      // 404: the service has never seen this player. Nothing to merge, and nothing wrong.
      if (response.status === 404) return []
      if (!response.ok) throw new Error(`${name} respondió ${response.status}`)
      return parse(await response.json())
    }
    const results = await Promise.allSettled([ask('LabyNet', LABY_TEXTURES(dashed), parseLabySkins), ask('Crafty.gg', CRAFTY_PLAYER + dashed, parseCraftySkins)])
    const found = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    const failed = results.filter((result) => result.status === 'rejected')
    if (failed.length === results.length) throw new Error('Ningún historial público respondió.')
    const added = await history.mergeRemote(found)
    if (added > 0) log.info('[Skins] %d skins antiguas traídas de los historiales públicos', added)
  }

  ipc.handle('skins:history', [], async (): Promise<SkinHistoryItem[]> => {
    const file = await history.read()
    return file.entries.map((entry) => ({
      hash: entry.hash,
      variant: entry.variant,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
      sources: entry.sources ?? [entry.source ?? 'launcher'],
      url: historyUrl(entry.hash),
      current: entry.hash === file.current
    }))
  })

  ipc.handle('skins:history-sync', [], async () => {
    const { account } = await deps.getSession()
    await syncRemote(account.uuid, true)
  })

  // NameMC: the player opens it in a window and passes its check; see nameMc.ts
  ipc.handle('skins:history-namemc', [], async (event) => {
    const test = getConfig().testAccount
    const uuid = test ? test.uuid : (await deps.getSession()).account.uuid
    const skins = await readNameMcSkins({
      uuid,
      parent: BrowserWindow.fromWebContents(event.sender),
      dumpPath: join(deps.dataRoot, 'launcher', 'logs', 'namemc-profile.html'),
      skinDumpPath: join(deps.dataRoot, 'launcher', 'logs', 'namemc-skin.html')
    })
    const added = await history.mergeRemote(skins, false)
    if (added > 0) log.info('[Skins] %d skins antiguas traídas de NameMC', added)
    return { found: skins.length, added }
  })

  ipc.handle('skins:history-apply', [z.string().regex(TEXTURE_HASH)], async (_event, hash) => {
    const entry = await historyEntry(hash)
    await uploadSkin(entry.bytes, entry.variant)
    return fetchProfile()
  })

  ipc.handle('skins:history-save', [z.string().regex(TEXTURE_HASH)], async (_event, hash) => {
    const entry = await historyEntry(hash)
    // NameMC does not say when a skin was worn: those keep a name without a date
    const name = entry.firstSeenAt > 0 ? `Skin del ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(entry.firstSeenAt)}` : 'Skin del historial'
    return addToLibrary(entry.bytes, name, entry.variant)
  })

  // The editor: any player's current skin by name, and saving what was drawn
  ipc.handle('skins:lookup', [z.string().regex(/^\w{3,16}$/)], async (_event, name) => {
    const found = await fetchWithTimeout(NAME_LOOKUP + encodeURIComponent(name), { headers: { Accept: 'application/json', 'User-Agent': getUserAgent() } }, 10_000)
    if (found.status === 404 || found.status === 204) throw new Error(`No existe ninguna cuenta de Minecraft llamada «${name}».`)
    if (!found.ok) throw new Error('Mojang no respondió. Inténtalo de nuevo en un momento.')
    const profile = (await found.json()) as { id?: string; name?: string }
    if (!profile.id) throw new Error(`No existe ninguna cuenta de Minecraft llamada «${name}».`)
    const session = await fetchWithTimeout(SESSION_PROFILE + profile.id, { headers: { Accept: 'application/json', 'User-Agent': getUserAgent() } }, 10_000)
    const skin = session.ok ? skinTextureFromSession(await session.json()) : null
    if (!skin) throw new Error(`${profile.name ?? name} usa la skin por defecto de Minecraft.`)
    return { name: profile.name ?? name, url: skin.url, variant: skin.variant }
  })

  ipc.handle('skins:save-png', [z.string().trim().min(1).max(40), z.enum(['classic', 'slim']), z.string().max(400_000)], (_event, name, variant, dataUrl) => {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!match) throw new Error('La imagen no es un PNG válido.')
    return addToLibrary(new Uint8Array(Buffer.from(match[1], 'base64')), name, variant)
  })

  ipc.handle('skins:history-delete', [z.string().regex(TEXTURE_HASH)], (_event, hash) => history.remove(hash))

  const addToLibrary = async (bytes: Uint8Array, name: string, variant: SkinVariant): Promise<SkinLibraryItem> =>
    enqueue(async () => {
      if (bytes.byteLength > MAX_SKIN_BYTES || !isMinecraftSkinSize(readPngSize(bytes))) throw new Error('La skin debe ser un PNG de 64×64 o 64×32 píxeles.')
      const items = await readIndex()
      if (items.length >= MAX_LIBRARY) throw new Error(`Tu armario está lleno (${MAX_LIBRARY} skins). Borra alguna antes de añadir otra.`)
      const skin: StoredSkin = { id: randomUUID(), name: name.slice(0, 40) || 'Skin', variant, addedAt: Date.now(), favorite: false }
      await mkdir(dir, { recursive: true })
      await writeFile(filePath(skin.id), bytes)
      await writeIndex([skin, ...items])
      return toItem(skin)
    })

  ipc.handle('skins:profile', [], () => fetchProfile())

  ipc.handle('skins:list', [], async () => Promise.all((await readIndex()).map(toItem)))

  ipc.handle('skins:import', [], async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = { title: 'Elegir una skin', filters: [{ name: 'Skin de Minecraft (.png)', extensions: ['png'] }], properties: ['openFile'] }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    const source = result.filePaths[0]
    const info = await stat(source)
    if (info.size > MAX_SKIN_BYTES) throw new Error('El archivo es demasiado grande para ser una skin.')
    const bytes = new Uint8Array(await readFile(source))
    const item = await addToLibrary(bytes, basename(source).replace(/\.png$/i, ''), 'classic')
    return { canceled: false, item }
  })

  ipc.handle('skins:save-current', [], async () => {
    const profile = await fetchProfile()
    if (!profile.skin) throw new Error('Tu cuenta usa la skin por defecto de Minecraft: no hay nada que guardar.')
    const response = await fetchWithTimeout(profile.skin.url, { headers: { 'User-Agent': getUserAgent() } })
    if (!response.ok) throw new Error('No se pudo descargar tu skin actual.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    return addToLibrary(bytes, `${profile.name} actual`, profile.skin.variant)
  })

  ipc.handle(
    'skins:update',
    [z.string().uuid(), z.object({ name: z.string().trim().min(1).max(40).optional(), variant: z.enum(['classic', 'slim']).optional(), favorite: z.boolean().optional() })],
    (_event, id, patch) =>
      enqueue(async () => {
        const items = await readIndex()
        const index = items.findIndex((item) => item.id === id)
        if (index < 0) throw new Error('Esa skin ya no está en tu armario.')
        items[index] = { ...items[index], ...patch }
        await writeIndex(items)
        return toItem(items[index])
      })
  )

  ipc.handle('skins:delete', [z.string().uuid()], (_event, id) =>
    enqueue(async () => {
      const items = await readIndex()
      await writeIndex(items.filter((item) => item.id !== id))
      await rm(filePath(id), { force: true })
    })
  )

  ipc.handle('skins:apply', [z.string().uuid()], async (_event, id) => {
    const skin = (await readIndex()).find((item) => item.id === id)
    if (!skin) throw new Error('Esa skin ya no está en tu armario.')
    await uploadSkin(new Uint8Array(await readFile(filePath(id))), skin.variant)
    return fetchProfile()
  })

  ipc.handle('skins:set-cape', [z.string().uuid().nullable()], async (_event, capeId) => {
    const { token } = await authorized()
    const response = capeId
      ? await fetchWithTimeout(`${API}/capes/active`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': getUserAgent() }, body: JSON.stringify({ capeId }) })
      : await fetchWithTimeout(`${API}/capes/active`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'User-Agent': getUserAgent() } })
    if (!response.ok) throw apiError(response.status)
    log.info('[Skins] Capa %s', capeId ? 'cambiada' : 'quitada')
    return fetchProfile()
  })

  return {
    recordAccountSkin: async (uuid) => {
      try {
        const response = await fetchWithTimeout(SESSION_PROFILE + uuid.replace(/-/g, '').toLowerCase(), { headers: { Accept: 'application/json', 'User-Agent': getUserAgent() } }, 10_000)
        const skin = response.ok ? skinTextureFromSession(await response.json()) : null
        if (skin) await history.record(skin.url, skin.variant)
      } catch (err) {
        log.debug('[Skins] No se pudo comprobar la skin actual: %s', String(err))
      }
      await syncRemote(uuid, false).catch((err: unknown) => log.debug('[Skins] Historial público no disponible: %s', String(err)))
    }
  }
}
