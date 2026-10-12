import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

/** What a factory reset keeps unless the user explicitly asks to delete their worlds too. */
export const USER_DATA_ENTRIES = ['saves', 'screenshots', 'resourcepacks', 'shaderpacks', 'options.txt', 'servers.dat'] as const

/**
 * The folders the launcher creates in its data folder. That folder is also Electron's own (Cache,
 * Local Storage, GPUCache...), whose files are open while the app runs: those are cleared through
 * the session API instead, never deleted here.
 */
const LAUNCHER_ENTRIES = ['launcher', 'instances', 'runtime', 'common'] as const

const remove = (path: string): Promise<void> => rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })

async function removeChildren(dir: string, keep: ReadonlySet<string>): Promise<void> {
  const entries = await readdir(dir).catch(() => [] as string[])
  for (const entry of entries) {
    if (!keep.has(entry)) await remove(join(dir, entry))
  }
}

/**
 * Wipes launcher data (account, settings, Java, game files, modpack and custom mods).
 * By default the player's worlds, screenshots, resource packs, shaders and options survive,
 * and `launcher/logs` is always kept because it is diagnostic data and may still be open.
 */
export async function resetLauncherData(dataRoot: string, options: { deleteWorlds: boolean }): Promise<{ preserved: string[] }> {
  const instance = join(dataRoot, 'instances', 'orvian')
  const preserved: string[] = []

  if (options.deleteWorlds) {
    await removeChildren(join(dataRoot, 'launcher'), new Set(['logs']))
    for (const entry of LAUNCHER_ENTRIES) if (entry !== 'launcher') await remove(join(dataRoot, entry))
  } else {
    const keep = new Set<string>(USER_DATA_ENTRIES)
    const existing = await readdir(instance).catch(() => [] as string[])
    preserved.push(...existing.filter((entry) => keep.has(entry)))
    await removeChildren(instance, keep)
    await removeChildren(join(dataRoot, 'instances'), new Set(['orvian']))
    await removeChildren(join(dataRoot, 'launcher'), new Set(['logs']))
    for (const entry of LAUNCHER_ENTRIES) if (entry !== 'launcher' && entry !== 'instances') await remove(join(dataRoot, entry))
  }

  await mkdir(join(dataRoot, 'launcher', 'logs'), { recursive: true })
  await mkdir(instance, { recursive: true })
  return { preserved }
}
