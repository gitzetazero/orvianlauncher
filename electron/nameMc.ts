import { writeFile } from 'node:fs/promises'
import { BrowserWindow, nativeImage, session } from 'electron'
import type { SkinVariant } from '../src/shared/ipc-contract'
import { log } from './logger'
import type { RemoteSkin } from './skinHistory'

/**
 * NameMC has no API for skin history and its pages sit behind a Cloudflare check that only a person
 * can pass. So the launcher opens the player's NameMC profile in a normal window: if Cloudflare asks,
 * the player answers it there. Once the profile is on screen the launcher reads the skins it lists,
 * visits each skin's page for its date, and downloads the textures through that same window.
 */

const PARTITION = 'persist:namemc'
const PROFILE = (uuid: string): string => `https://namemc.com/profile/${uuid}`
const SKIN_PAGE = (id: string): string => `https://namemc.com/skin/${id}`
const TEXTURE = (id: string): string => `https://s.namemc.com/i/${id}.png`
const ALLOWED_HOSTS = /(^|\.)namemc\.com$|^challenges\.cloudflare\.com$/
const GIVE_UP_MS = 4 * 60_000
const SHOW_AFTER_MS = 8000
const MAX_SKINS = 80

/** One skin as the profile page lists it. */
export interface NameMcListing {
  id: string
  /** Any date the profile shows next to the skin, as written there. */
  when: string | null
}

interface Reading {
  challenge: boolean
  path: string
  ready: boolean
}

interface ProfileReading extends Reading {
  skins: NameMcListing[]
}

/** What a skin page shows about its date: a machine date, a tooltip, or a short age such as "173d". */
export interface SkinPageDate {
  datetime: string | null
  title: string | null
  relative: string | null
}

type SkinReading = Reading & SkinPageDate

/** Shared by both scripts: is Cloudflare asking for a person, and has the page finished loading. */
const PAGE_STATE = `
  const title = document.title || ''
  const challenge = /just a moment|un momento|attention required|checking your browser/i.test(title)
    || !!document.querySelector('#challenge-form, #challenge-stage, .cf-turnstile, iframe[src*="challenges.cloudflare.com"]')
  const state = { challenge, path: location.pathname, ready: document.readyState === 'complete' }
`

/**
 * Run inside the NameMC page in an isolated world, so the page's own scripts cannot change them.
 * Profile: skins are links to `/skin/{id}`; the "Skins" card is preferred so other skins are left out.
 */
const READ_PROFILE = `(() => {${PAGE_STATE}
  const cards = Array.from(document.querySelectorAll('.card, section, div'))
    .filter((el) => { const head = el.querySelector(':scope > .card-header, :scope > h2, :scope > h3, :scope > strong'); return head && /^\\s*skins\\b/i.test(head.textContent || '') })
  const scope = cards.find((card) => card.querySelector('a[href*="/skin/"]')) || document
  const seen = new Set()
  const skins = []
  for (const link of scope.querySelectorAll('a[href*="/skin/"]')) {
    const match = /\\/skin\\/([0-9a-f]{16,32})(?:[/?#]|$)/i.exec(link.getAttribute('href') || '')
    if (!match) continue
    const id = match[1].toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    const time = link.querySelector('time[datetime]')
    skins.push({ id, when: (time && time.getAttribute('datetime')) || null })
  }
  return { ...state, skins }
})()`

/** Skin page: the age shown under the skin ("173d"), with any exact date in a <time> or a tooltip. */
const READ_SKIN = `(() => {${PAGE_STATE}
  const tip = (el) => el && (el.getAttribute('datetime') || el.getAttribute('title') || el.getAttribute('data-bs-original-title') || el.getAttribute('data-original-title'))
  const time = document.querySelector('time[datetime]')
  // The age may be split in pieces ("173<small>d</small>"): compare the text without spaces, and keep
  // the innermost element that still holds all of it
  const age = /^\\d+(s|m|min|h|d|w|mo|y)$/i
  const squash = (el) => (el.textContent || '').replace(/\\s+/g, '')
  const matches = Array.from(document.querySelectorAll('body *'))
    .filter((el) => el.querySelectorAll('*').length <= 4 && age.test(squash(el)))
  const leaf = matches.find((el) => !matches.some((other) => other !== el && el.contains(other))) || null
  const titled = leaf ? tip(leaf) || tip(leaf.querySelector('[title], [data-bs-original-title], [data-original-title]')) || tip(leaf.closest('[title], [data-bs-original-title], [data-original-title]')) : null
  return { ...state, datetime: time ? time.getAttribute('datetime') : null, title: titled || null, relative: leaf ? squash(leaf) : null }
})()`

const DAY = 86_400_000
const AGE_UNITS: Record<string, number> = { s: 1000, m: 60_000, min: 60_000, h: 3_600_000, d: DAY, w: 7 * DAY, mo: 30 * DAY, y: 365 * DAY }

/** A date NameMC shows, or 0 when there is none: an unknown date is never invented. */
export function parseNameMcDate(value: string | null, now: number = Date.now()): number {
  if (!value) return 0
  const at = Date.parse(value)
  return Number.isNaN(at) || at < Date.UTC(2010, 0, 1) || at > now + DAY ? 0 : at
}

/** NameMC's short ages: "173d" is 173 days before now. */
export function parseNameMcAge(value: string | null, now: number = Date.now()): number {
  const match = /^(\d+)\s*(s|m|min|h|d|w|mo|y)$/i.exec(value?.trim() ?? '')
  if (!match) return 0
  const at = now - Number(match[1]) * AGE_UNITS[match[2].toLowerCase()]
  return at < Date.UTC(2010, 0, 1) ? 0 : at
}

/** The most exact date a skin page offers: its machine date, then its tooltip, then its age. */
export function skinPageDate(page: SkinPageDate, now: number = Date.now()): number {
  return parseNameMcDate(page.datetime, now) || parseNameMcDate(page.title, now) || parseNameMcAge(page.relative, now)
}

/** Slim skins leave the two outer columns of the right arm's front empty (x 54-55, y 20-31). */
export function isSlimBitmap(bitmap: Uint8Array, width: number, height: number): boolean {
  if (width !== 64 || height !== 64) return false
  const alpha = (x: number, y: number): number => bitmap[(y * width + x) * 4 + 3]
  for (const y of [20, 25, 31]) if (alpha(54, y) !== 0 || alpha(55, y) !== 0) return false
  return true
}

function variantOf(png: Uint8Array): SkinVariant {
  const image = nativeImage.createFromBuffer(Buffer.from(png))
  if (image.isEmpty()) return 'classic'
  const { width, height } = image.getSize()
  return isSlimBitmap(new Uint8Array(image.toBitmap()), width, height) ? 'slim' : 'classic'
}

function openWindow(parent: BrowserWindow | null | undefined): BrowserWindow {
  const nameMcSession = session.fromPartition(PARTITION)
  nameMcSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    show: false,
    title: 'NameMC · Orvian Launcher',
    parent: parent ?? undefined,
    modal: Boolean(parent),
    autoHideMenuBar: true,
    backgroundColor: '#080305',
    webPreferences: { session: nameMcSession, nodeIntegration: false, contextIsolation: true, sandbox: true }
  })
  win.setMenu(null)
  const guard = (event: Electron.Event, url: string): void => {
    try {
      const target = new URL(url)
      if (target.protocol === 'https:' && ALLOWED_HOSTS.test(target.hostname)) return
    } catch {
      // Malformed: blocked below
    }
    event.preventDefault()
  }
  win.webContents.on('will-navigate', guard)
  win.webContents.on('will-redirect', guard)
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return win
}

/**
 * Loads `url` and reads it with `code` once it is ready. While Cloudflare asks for a person, or the
 * page is slow, the window is shown so the player can see and answer it.
 */
function visit<T extends Reading>(win: BrowserWindow, url: string, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const started = Date.now()
    const finish = (outcome: { reading: T } | { error: Error }): void => {
      if (settled) return
      settled = true
      clearInterval(timer)
      win.off('closed', onClosed)
      if ('reading' in outcome) resolve(outcome.reading)
      else reject(outcome.error)
    }
    const onClosed = (): void => finish({ error: new Error('Cerraste la ventana de NameMC antes de terminar.') })
    const timer = setInterval(() => {
      if (win.isDestroyed()) return
      if (Date.now() - started > GIVE_UP_MS) {
        finish({ error: new Error('NameMC tardó demasiado en responder. Inténtalo de nuevo.') })
        return
      }
      win.webContents
        .executeJavaScriptInIsolatedWorld(1, [{ code }])
        .then((reading: T) => {
          if (settled || !reading) return
          if ((reading.challenge || Date.now() - started > SHOW_AFTER_MS) && !win.isVisible()) {
            win.show()
            win.focus()
          }
          if (!reading.challenge && reading.ready) finish({ reading })
        })
        .catch(() => undefined)
    }, 700)
    win.on('closed', onClosed)
    win.loadURL(url).catch(() => {
      // A failed load is shown to the player in the window; the check above keeps waiting
      if (!win.isDestroyed() && !win.isVisible()) win.show()
    })
  })
}

let running = false

/**
 * Opens the profile, waits until it is readable (the player may have to pass Cloudflare's check),
 * and returns the skins it lists with their dates and textures. `dumpPath` receives the page when no
 * skin is found, so a change in NameMC's layout can be diagnosed.
 */
export async function readNameMcSkins(options: { uuid: string; parent?: BrowserWindow | null; dumpPath?: string; skinDumpPath?: string }): Promise<RemoteSkin[]> {
  if (running) throw new Error('La ventana de NameMC ya está abierta.')
  running = true
  const dashed = options.uuid.replace(/-/g, '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
  const win = openWindow(options.parent)

  try {
    const profile = await visit<ProfileReading>(win, PROFILE(dashed), READ_PROFILE)
    if (!profile.path.startsWith('/profile/')) throw new Error('NameMC no tiene un perfil para esta cuenta.')
    if (profile.skins.length === 0 && options.dumpPath) {
      const html = (await win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => '')) as string
      await writeFile(options.dumpPath, html, 'utf8').catch(() => undefined)
      log.warn('[NameMC] Perfil sin skins reconocibles; página guardada para revisarla')
    }
    const listing = profile.skins.slice(0, MAX_SKINS)

    const skins: RemoteSkin[] = []
    let dumpedSkin = false
    for (const item of listing) {
      // The date lives on each skin's own page; a page that cannot be read leaves the skin undated
      let at = parseNameMcDate(item.when)
      if (!at) {
        const page = await visit<SkinReading>(win, SKIN_PAGE(item.id), READ_SKIN).catch((err: unknown) => {
          if (win.isDestroyed()) throw err
          return null
        })
        if (page) at = skinPageDate(page)
        // Keep one undated skin page for diagnosis: NameMC may have changed how it shows the date
        if (page && !at && options.skinDumpPath && !dumpedSkin) {
          dumpedSkin = true
          const html = (await win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => '')) as string
          await writeFile(options.skinDumpPath, html, 'utf8').catch(() => undefined)
          log.warn('[NameMC] Skin sin fecha reconocible (%s); página guardada para revisarla', JSON.stringify({ datetime: page.datetime, title: page.title, relative: page.relative }))
        }
      }
      // Textures come through the same session that passed the check
      try {
        const response = await win.webContents.session.fetch(TEXTURE(item.id), { signal: AbortSignal.timeout(15_000) })
        if (!response.ok) continue
        const bytes = new Uint8Array(await response.arrayBuffer())
        skins.push({ key: `namemc-${item.id}`, url: TEXTURE(item.id), variant: variantOf(bytes), firstSeenAt: at, lastSeenAt: at, source: 'namemc', bytes })
      } catch (err) {
        log.debug('[NameMC] Textura %s no descargada: %s', item.id, String(err))
      }
    }
    log.info('[NameMC] %d skins en el perfil, %d descargadas, %d con fecha', listing.length, skins.length, skins.filter((skin) => skin.firstSeenAt > 0).length)
    return skins
  } finally {
    running = false
    if (!win.isDestroyed()) win.destroy()
  }
}
