import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { BrowserWindow, clipboard, ClipboardItem, dialog, nativeImage, shell } from 'electron'
import { z } from 'zod'
import { readActiveShader, readResourcePacks, toggleResourcePack, writeActiveShader, writeResourcePacks } from '../src/shared/gameFiles'
import type { PackItem, PackKind, PackList, ScreenshotItem } from '../src/shared/ipc-contract'
import { assertInside, isSafeFileName } from '../src/shared/paths'
import type { Ipc } from './ipc'
import { log } from './logger'
import { SCREENSHOT_EXTENSIONS, screenshotUrl } from './media'

/** The player's screenshots, resource packs and shader packs: plain folders inside the game instance. */

const PACK_EXTENSIONS = ['.zip'] as const
const MAX_PACK_BYTES = 1024 * 1024 * 1024
const SHADER_CONFIGS = ['oculus.properties', 'iris.properties'] as const

export interface LibraryDeps {
  dataRoot: string
  /** Packs and options must not change under a running game. */
  isGameRunning: () => boolean
}

async function readText(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch(() => null)
}

async function folderSize(dir: string, depth = 0): Promise<number> {
  if (depth > 6) return 0
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += await folderSize(path, depth + 1)
    else total += (await stat(path).catch(() => null))?.size ?? 0
  }
  return total
}

/** A pack is a .zip file or an unpacked folder; its name must still be a plain, safe name. */
function isPackName(name: string, isFolder: boolean): boolean {
  if (isFolder) return isSafeFileName(`${name}.zip`, PACK_EXTENSIONS)
  return isSafeFileName(name, PACK_EXTENSIONS)
}

/**
 * Names of the packs (files or top-level folders) that the modpack installs in `kind`, read from the
 * sync state the pack installer keeps. Lower-cased, like the mod list does.
 */
export function officialPackNames(stateFiles: Record<string, unknown>, kind: PackKind): Set<string> {
  const names = new Set<string>()
  const prefix = `${kind}/`
  for (const key of Object.keys(stateFiles)) {
    const normalized = key.replace(/\\/g, '/')
    if (!normalized.toLowerCase().startsWith(prefix)) continue
    const first = normalized.slice(prefix.length).split('/')[0]
    if (first) names.add(first.toLowerCase())
  }
  return names
}

export function registerLibraryIpc(ipc: Ipc, deps: LibraryDeps): void {
  const instance = join(deps.dataRoot, 'instances', 'orvian')
  const statePath = join(instance, '.orvian', 'official-state.json')

  const officialPacks = async (kind: PackKind): Promise<Set<string>> => {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8')) as { files?: Record<string, unknown> }
      return officialPackNames(state.files ?? {}, kind)
    } catch {
      return new Set()
    }
  }
  const guardNotOfficial = async (kind: PackKind, name: string): Promise<void> => {
    if ((await officialPacks(kind)).has(name.toLowerCase())) {
      throw new Error(`${name} forma parte del modpack oficial y no se puede modificar ni borrar desde el launcher.`)
    }
  }
  const screenshots = join(instance, 'screenshots')
  const folders: Record<PackKind, string> = { resourcepacks: join(instance, 'resourcepacks'), shaderpacks: join(instance, 'shaderpacks') }
  const optionsFile = join(instance, 'options.txt')

  const guardIdle = (): void => {
    if (deps.isGameRunning()) throw new Error('Cierra Minecraft antes de cambiar esto: el juego sobrescribe sus opciones al salir.')
  }

  const screenshotPath = (file: string): string => {
    if (!isSafeFileName(file, SCREENSHOT_EXTENSIONS)) throw new Error('Nombre de captura no válido.')
    return assertInside(screenshots, join(screenshots, file))
  }

  // ─── Screenshots ──────────────────────────────────────────────────────────
  ipc.handle('screenshots:list', [], async (): Promise<ScreenshotItem[]> => {
    const entries = await readdir(screenshots, { withFileTypes: true }).catch(() => [])
    const items: ScreenshotItem[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !isSafeFileName(entry.name, SCREENSHOT_EXTENSIONS)) continue
      const info = await stat(join(screenshots, entry.name)).catch(() => null)
      if (!info) continue
      items.push({
        file: entry.name,
        size: info.size,
        takenAt: info.mtimeMs,
        thumbUrl: screenshotUrl(entry.name, 'thumb', info.mtimeMs),
        url: screenshotUrl(entry.name, 'full', info.mtimeMs)
      })
    }
    return items.sort((a, b) => b.takenAt - a.takenAt)
  })

  ipc.handle('screenshots:open', [z.string().max(255)], async (_event, file) => {
    const error = await shell.openPath(screenshotPath(file))
    if (error) throw new Error('No se pudo abrir la captura.')
  })

  ipc.handle('screenshots:copy', [z.string().max(255)], async (_event, file) => {
    const image = nativeImage.createFromPath(screenshotPath(file))
    if (image.isEmpty()) throw new Error('No se pudo leer la captura.')
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })])
  })

  ipc.handle('screenshots:delete', [z.string().max(255)], async (_event, file) => {
    await shell.trashItem(screenshotPath(file))
    log.info('[Capturas] Enviada a la papelera: %s', file)
  })

  // ─── Resource packs and shaders ───────────────────────────────────────────
  const shaderConfig = async (): Promise<{ path: string; text: string } | null> => {
    for (const name of SHADER_CONFIGS) {
      const path = join(instance, 'config', name)
      const text = await readText(path)
      if (text !== null) return { path, text }
    }
    return null
  }

  ipc.handle('packs:list', [z.enum(['resourcepacks', 'shaderpacks'])], async (_event, kind): Promise<PackList> => {
    const dir = folders[kind]
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    let enabled: Set<string>
    let canToggle: boolean
    if (kind === 'resourcepacks') {
      const options = await readText(optionsFile)
      enabled = new Set(readResourcePacks(options ?? ''))
      canToggle = true
    } else {
      const config = await shaderConfig()
      const active = config ? readActiveShader(config.text) : null
      enabled = new Set(active ? [active] : [])
      canToggle = config !== null
    }

    const official = await officialPacks(kind)
    const items: PackItem[] = []
    for (const entry of entries) {
      const isFolder = entry.isDirectory()
      if (!isFolder && !entry.isFile()) continue
      if (!isPackName(entry.name, isFolder)) continue
      const path = join(dir, entry.name)
      const info = await stat(path).catch(() => null)
      if (!info) continue
      items.push({
        name: entry.name,
        isFolder,
        size: isFolder ? await folderSize(path) : info.size,
        modifiedAt: info.mtimeMs,
        enabled: kind === 'resourcepacks' ? enabled.has(`file/${entry.name}`) : enabled.has(entry.name),
        isOfficial: official.has(entry.name.toLowerCase())
      })
    }
    items.sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
    return { items, canToggle }
  })

  const packPath = (kind: PackKind, name: string): string => {
    const path = assertInside(folders[kind], join(folders[kind], name))
    if (!isPackName(name, false) && !isPackName(name, true)) throw new Error('Nombre de pack no válido.')
    return path
  }

  ipc.handle('packs:set-enabled', [z.enum(['resourcepacks', 'shaderpacks']), z.string().max(255), z.boolean()], async (_event, kind, name, enabled) => {
    guardIdle()
    await stat(packPath(kind, name))
    await guardNotOfficial(kind, name)
    if (kind === 'resourcepacks') {
      const options = (await readText(optionsFile)) ?? ''
      const next = toggleResourcePack(readResourcePacks(options), name, enabled)
      await writeFile(optionsFile, writeResourcePacks(options, next), 'utf8')
    } else {
      const config = await shaderConfig()
      if (!config) throw new Error('Abre el menú de shaders del juego una vez; después podrás elegirlos aquí.')
      await writeFile(config.path, writeActiveShader(config.text, enabled ? name : null), 'utf8')
    }
    log.info('[Packs] %s %s: %s', kind, enabled ? 'activado' : 'desactivado', name)
  })

  ipc.handle('packs:add', [z.enum(['resourcepacks', 'shaderpacks'])], async (event, kind) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: kind === 'resourcepacks' ? 'Añadir resource packs' : 'Añadir shaders',
      filters: [{ name: 'Packs (.zip)', extensions: ['zip'] }],
      properties: ['openFile', 'multiSelections']
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return { added: [] }
    await mkdir(folders[kind], { recursive: true })
    const official = await officialPacks(kind)
    const added: string[] = []
    const skipped: string[] = []
    for (const source of result.filePaths) {
      const name = basename(source)
      if (!isSafeFileName(name, PACK_EXTENSIONS)) continue
      // Never overwrite a pack the modpack installed
      if (official.has(name.toLowerCase())) {
        skipped.push(name)
        continue
      }
      const info = await stat(source).catch(() => null)
      if (!info || !info.isFile() || info.size > MAX_PACK_BYTES) continue
      await copyFile(source, assertInside(folders[kind], join(folders[kind], name)))
      added.push(name)
    }
    log.info('[Packs] %d añadidos a %s', added.length, kind)
    return { added, skipped }
  })

  ipc.handle('packs:delete', [z.enum(['resourcepacks', 'shaderpacks']), z.string().max(255)], async (_event, kind, name) => {
    guardIdle()
    await guardNotOfficial(kind, name)
    await shell.trashItem(packPath(kind, name))
    if (kind === 'resourcepacks') {
      const options = await readText(optionsFile)
      if (options !== null) await writeFile(optionsFile, writeResourcePacks(options, toggleResourcePack(readResourcePacks(options), name, false)), 'utf8')
    }
    log.info('[Packs] Enviado a la papelera: %s/%s', kind, name)
  })
}
